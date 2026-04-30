// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentRegistry8004
/// @notice Minimal full-featured registry for ERC-8004-style agent metadata
///         plus ENS backlink fields used by strict ENSIP-25 trust checks.
contract AgentRegistry8004 {
    address public owner;

    struct AgentRecord {
        string agentId;
        address controller;
        string ensName;
        string tokenUri;
        string capabilitiesUri;
        string metadataUri;
        bool active;
        uint64 createdAt;
        uint64 updatedAt;
    }

    mapping(bytes32 => AgentRecord) private records;

    event OwnerUpdated(address indexed previousOwner, address indexed newOwner);
    event AgentUpserted(
        bytes32 indexed agentKey,
        string agentId,
        address indexed controller,
        string ensName,
        bool active
    );
    event AgentRemoved(bytes32 indexed agentKey, string agentId);

    modifier onlyOwner() {
        require(msg.sender == owner, "only owner");
        _;
    }

    modifier onlyControllerOrOwner(bytes32 agentKey) {
        AgentRecord storage record = records[agentKey];
        require(
            msg.sender == owner || (record.controller != address(0) && msg.sender == record.controller),
            "only controller or owner"
        );
        _;
    }

    constructor(address initialOwner) {
        owner = initialOwner == address(0) ? msg.sender : initialOwner;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "newOwner required");
        address previousOwner = owner;
        owner = newOwner;
        emit OwnerUpdated(previousOwner, newOwner);
    }

    function upsertAgent(
        string calldata agentId,
        address controller,
        string calldata ensName,
        string calldata tokenUri,
        string calldata capabilitiesUri,
        string calldata metadataUri,
        bool active
    ) external onlyOwner {
        bytes32 agentKey = _agentKey(agentId);
        AgentRecord storage record = records[agentKey];
        bool isNew = record.createdAt == 0;
        uint64 nowTs = uint64(block.timestamp);

        record.agentId = agentId;
        record.controller = controller;
        record.ensName = ensName;
        record.tokenUri = tokenUri;
        record.capabilitiesUri = capabilitiesUri;
        record.metadataUri = metadataUri;
        record.active = active;
        if (isNew) {
            record.createdAt = nowTs;
        }
        record.updatedAt = nowTs;

        emit AgentUpserted(agentKey, agentId, controller, ensName, active);
    }

    function updateEnsName(string calldata agentId, string calldata ensName)
        external
        onlyControllerOrOwner(_agentKey(agentId))
    {
        bytes32 agentKey = _agentKey(agentId);
        AgentRecord storage record = records[agentKey];
        require(record.createdAt != 0, "agent missing");
        record.ensName = ensName;
        record.updatedAt = uint64(block.timestamp);
        emit AgentUpserted(agentKey, record.agentId, record.controller, ensName, record.active);
    }

    function setAgentActive(string calldata agentId, bool active)
        external
        onlyControllerOrOwner(_agentKey(agentId))
    {
        bytes32 agentKey = _agentKey(agentId);
        AgentRecord storage record = records[agentKey];
        require(record.createdAt != 0, "agent missing");
        record.active = active;
        record.updatedAt = uint64(block.timestamp);
        emit AgentUpserted(agentKey, record.agentId, record.controller, record.ensName, active);
    }

    function removeAgent(string calldata agentId) external onlyOwner {
        bytes32 agentKey = _agentKey(agentId);
        AgentRecord storage record = records[agentKey];
        require(record.createdAt != 0, "agent missing");
        string memory removedId = record.agentId;
        delete records[agentKey];
        emit AgentRemoved(agentKey, removedId);
    }

    function getAgent(string calldata agentId)
        external
        view
        returns (
            string memory outAgentId,
            address controller,
            string memory ensName,
            string memory tokenUri,
            string memory capabilitiesUri,
            string memory metadataUri,
            bool active,
            uint64 createdAt,
            uint64 updatedAt
        )
    {
        AgentRecord storage record = records[_agentKey(agentId)];
        require(record.createdAt != 0, "agent missing");
        return (
            record.agentId,
            record.controller,
            record.ensName,
            record.tokenUri,
            record.capabilitiesUri,
            record.metadataUri,
            record.active,
            record.createdAt,
            record.updatedAt
        );
    }

    function exists(string calldata agentId) external view returns (bool) {
        return records[_agentKey(agentId)].createdAt != 0;
    }

    function verifyEnsLink(string calldata agentId, string calldata ensName) external view returns (bool) {
        AgentRecord storage record = records[_agentKey(agentId)];
        if (record.createdAt == 0 || !record.active) {
            return false;
        }
        return keccak256(bytes(_normalize(record.ensName))) == keccak256(bytes(_normalize(ensName)));
    }

    function _agentKey(string memory agentId) private pure returns (bytes32) {
        require(bytes(agentId).length > 0, "agentId required");
        return keccak256(bytes(agentId));
    }

    function _normalize(string memory value) private pure returns (string memory) {
        bytes memory source = bytes(value);
        bytes memory out = new bytes(source.length);
        for (uint256 i = 0; i < source.length; i++) {
            bytes1 c = source[i];
            if (c >= 0x41 && c <= 0x5A) {
                out[i] = bytes1(uint8(c) + 32);
            } else {
                out[i] = c;
            }
        }
        return string(out);
    }
}
