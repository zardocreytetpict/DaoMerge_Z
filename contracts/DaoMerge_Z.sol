pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract DaoMerge_Z is ZamaEthereumConfig {
    
    struct DaoData {
        string daoName;                    
        euint32 encryptedContribution;        
        uint256 publicMemberCount;          
        uint256 publicTreasury;          
        string daoDescription;            
        address creator;               
        uint256 creationTimestamp;             
        uint32 decryptedContribution; 
        bool isVerified; 
    }
    

    mapping(string => DaoData) public daoData;
    
    string[] public daoIds;
    
    event DaoDataCreated(string indexed daoId, address indexed creator);
    event DecryptionVerified(string indexed daoId, uint32 decryptedContribution);
    
    constructor() ZamaEthereumConfig() {
    }
    
    function createDaoData(
        string calldata daoId,
        string calldata daoName,
        externalEuint32 encryptedContribution,
        bytes calldata inputProof,
        uint256 publicMemberCount,
        uint256 publicTreasury,
        string calldata daoDescription
    ) external {
        require(bytes(daoData[daoId].daoName).length == 0, "DAO data already exists");
        
        require(FHE.isInitialized(FHE.fromExternal(encryptedContribution, inputProof)), "Invalid encrypted input");
        
        daoData[daoId] = DaoData({
            daoName: daoName,
            encryptedContribution: FHE.fromExternal(encryptedContribution, inputProof),
            publicMemberCount: publicMemberCount,
            publicTreasury: publicTreasury,
            daoDescription: daoDescription,
            creator: msg.sender,
            creationTimestamp: block.timestamp,
            decryptedContribution: 0,
            isVerified: false
        });
        
        FHE.allowThis(daoData[daoId].encryptedContribution);
        
        FHE.makePubliclyDecryptable(daoData[daoId].encryptedContribution);
        
        daoIds.push(daoId);
        
        emit DaoDataCreated(daoId, msg.sender);
    }
    
    function verifyDecryption(
        string calldata daoId, 
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(daoData[daoId].daoName).length > 0, "DAO data does not exist");
        require(!daoData[daoId].isVerified, "Data already verified");
        
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(daoData[daoId].encryptedContribution);
        
        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));
        
        daoData[daoId].decryptedContribution = decodedValue;
        daoData[daoId].isVerified = true;
        
        emit DecryptionVerified(daoId, decodedValue);
    }
    
    function getEncryptedContribution(string calldata daoId) external view returns (euint32) {
        require(bytes(daoData[daoId].daoName).length > 0, "DAO data does not exist");
        return daoData[daoId].encryptedContribution;
    }
    
    function getDaoData(string calldata daoId) external view returns (
        string memory daoName,
        uint256 publicMemberCount,
        uint256 publicTreasury,
        string memory daoDescription,
        address creator,
        uint256 creationTimestamp,
        bool isVerified,
        uint32 decryptedContribution
    ) {
        require(bytes(daoData[daoId].daoName).length > 0, "DAO data does not exist");
        DaoData storage data = daoData[daoId];
        
        return (
            data.daoName,
            data.publicMemberCount,
            data.publicTreasury,
            data.daoDescription,
            data.creator,
            data.creationTimestamp,
            data.isVerified,
            data.decryptedContribution
        );
    }
    
    function getAllDaoIds() external view returns (string[] memory) {
        return daoIds;
    }
    
    function isAvailable() public pure returns (bool) {
        return true;
    }
}


