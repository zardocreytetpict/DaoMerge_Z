import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface BusinessData {
  id: string;
  name: string;
  encryptedValueHandle?: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [businessList, setBusinessList] = useState<BusinessData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingData, setCreatingData] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({
    visible: false,
    status: "pending",
    message: ""
  });
  const [newData, setNewData] = useState({ name: "", value: "", description: "" });
  const [selectedData, setSelectedData] = useState<BusinessData | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [userHistory, setUserHistory] = useState<string[]>([]);

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;

      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({
          visible: true,
          status: "error",
          message: "FHEVM initialization failed"
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }

      try {
        await loadBusinessData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadBusinessData = async () => {
    if (!isConnected) return;

    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;

      const businessIds = await contract.getAllBusinessIds();
      const dataList: BusinessData[] = [];

      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          dataList.push({
            id: businessId,
            name: businessData.name,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }

      setBusinessList(dataList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const createBusinessData = async () => {
    if (!isConnected || !address) {
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return;
    }

    setCreatingData(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating encrypted data with Zama FHE..." });

    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");

      const encryptedValue = parseInt(newData.value) || 0;
      const businessId = `data-${Date.now()}`;

      const encryptedResult = await encrypt(contractAddress, address, encryptedValue);

      const tx = await contract.createBusinessData(
        businessId,
        newData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newData.description
      );

      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();

      setUserHistory(prev => [...prev, `Created: ${newData.name}`]);
      setTransactionStatus({ visible: true, status: "success", message: "Data created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);

      await loadBusinessData();
      setShowCreateModal(false);
      setNewData({ name: "", value: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally {
      setCreatingData(false);
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) {
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null;
    }

    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;

      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }

      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;

      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);

      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) =>
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );

      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];

      await loadBusinessData();
      setUserHistory(prev => [...prev, `Decrypted: ${businessId}`]);
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);

      return Number(clearValue);

    } catch (e: any) {
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadBusinessData();
        return null;
      }

      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null;
    } finally {
      setIsDecrypting(false);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;

      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredData = businessList.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const currentData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🔐 Private DAO Merger</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>

        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">⚡</div>
            <h2>Connect Your Wallet</h2>
            <p>Connect your wallet to access the encrypted DAO merger platform</p>
            <div className="feature-grid">
              <div className="feature-card">
                <div className="feature-icon">🔒</div>
                <h3>Encrypted Data</h3>
                <p>All sensitive data is fully encrypted using FHE technology</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🔄</div>
                <h3>Homomorphic Computation</h3>
                <p>Perform calculations on encrypted data without decryption</p>
              </div>
              <div className="feature-card">
                <div className="feature-icon">🤝</div>
                <h3>Secure Collaboration</h3>
                <p>Enable privacy-preserving DAO mergers and partnerships</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="metal-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo-section">
          <h1>🔐 Private DAO Merger</h1>
          <p>Encrypted data sharing, homomorphic computation for mergers</p>
        </div>

        <div className="header-controls">
          <button onClick={checkAvailability} className="metal-btn">
            Check Availability
          </button>
          <button onClick={() => setShowCreateModal(true)} className="metal-btn primary">
            + New Data
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>

      <div className="dashboard-grid">
        <div className="stats-panel">
          <h3>📊 Data Overview</h3>
          <div className="stat-cards">
            <div className="stat-card">
              <div className="stat-value">{businessList.length}</div>
              <div className="stat-label">Total Entries</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{businessList.filter(d => d.isVerified).length}</div>
              <div className="stat-label">Verified</div>
            </div>
            <div className="stat-card">
              <div className="stat-value">{userHistory.length}</div>
              <div className="stat-label">Your Actions</div>
            </div>
          </div>
        </div>

        <div className="search-panel">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search data entries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button onClick={loadBusinessData} className="metal-btn">
              {isRefreshing ? "🔄" : "Refresh"}
            </button>
          </div>
        </div>

        <div className="data-panel">
          <h3>📋 Encrypted Data List</h3>
          <div className="data-table">
            {currentData.length === 0 ? (
              <div className="empty-state">
                <p>No encrypted data found</p>
                <button onClick={() => setShowCreateModal(true)} className="metal-btn">
                  Create First Entry
                </button>
              </div>
            ) : (
              currentData.map((item, index) => (
                <div key={index} className="data-item">
                  <div className="data-main">
                    <div className="data-name">{item.name}</div>
                    <div className="data-meta">
                      <span>Creator: {item.creator.substring(0, 8)}...</span>
                      <span>Date: {new Date(item.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="data-desc">{item.description}</div>
                  </div>
                  <div className="data-actions">
                    <div className={`status-badge ${item.isVerified ? 'verified' : 'encrypted'}`}>
                      {item.isVerified ? '✅ Verified' : '🔒 Encrypted'}
                    </div>
                    <button
                      onClick={() => decryptData(item.id)}
                      disabled={isDecrypting || item.isVerified}
                      className={`metal-btn small ${item.isVerified ? 'verified' : ''}`}
                    >
                      {item.isVerified ? 'Decrypted' : 'Decrypt'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="metal-btn"
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="metal-btn"
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className="history-panel">
          <h3>📖 Your Activity History</h3>
          <div className="history-list">
            {userHistory.slice(-10).map((action, index) => (
              <div key={index} className="history-item">
                <span className="history-icon">⚡</span>
                {action}
              </div>
            ))}
            {userHistory.length === 0 && (
              <p className="no-history">No activity yet</p>
            )}
          </div>
        </div>

        <div className="info-panel">
          <h3>ℹ️ About FHE Technology</h3>
          <div className="info-content">
            <p>Fully Homomorphic Encryption allows computations on encrypted data without decryption.</p>
            <div className="tech-steps">
              <div className="step">
                <span>1</span>
                <p>Data encrypted client-side using Zama FHE</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>Encrypted data stored on blockchain</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Computations performed on encrypted data</p>
              </div>
              <div className="step">
                <span>4</span>
                <p>Results verified on-chain with zero-knowledge proofs</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Create New Encrypted Data</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Data Name</label>
                <input
                  type="text"
                  value={newData.name}
                  onChange={(e) => setNewData({...newData, name: e.target.value})}
                  placeholder="Enter data name"
                />
              </div>
              <div className="form-group">
                <label>Encrypted Value (Integer)</label>
                <input
                  type="number"
                  value={newData.value}
                  onChange={(e) => setNewData({...newData, value: e.target.value})}
                  placeholder="Enter integer value"
                />
                <small>This value will be encrypted using FHE</small>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input
                  type="text"
                  value={newData.description}
                  onChange={(e) => setNewData({...newData, description: e.target.value})}
                  placeholder="Enter description"
                />
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="metal-btn">Cancel</button>
              <button
                onClick={createBusinessData}
                disabled={creatingData || !newData.name || !newData.value}
                className="metal-btn primary"
              >
                {creatingData ? "Creating..." : "Create Encrypted Data"}
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className={`notification ${transactionStatus.status}`}>
          <div className="notification-content">
            <span className="notification-icon">
              {transactionStatus.status === "pending" && "⏳"}
              {transactionStatus.status === "success" && "✅"}
              {transactionStatus.status === "error" && "❌"}
            </span>
            {transactionStatus.message}
          </div>
        </div>
      )}
    </div>
  );
};

export default App;


