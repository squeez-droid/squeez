// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISqueezIdentityRegistry {
    struct IdentityInput {
        string name;
        string symbol;
        bytes32 metadataHash;
        bytes32 imageHash;
        bytes32 socialHash;
        uint32 templateVersion;
        bytes32 tokenCodeHash;
    }

    function register(address token, address creator, address curve, IdentityInput calldata input)
        external
        returns (bytes32 canonicalHash);
    function lockIdentity(uint32 durationSeconds) external;
    function permanentlyLockSymbol() external;
    function nameCommitment(string calldata value) external pure returns (bytes32 commitment, string memory normalized);
    function symbolCommitment(string calldata value)
        external
        pure
        returns (bytes32 commitment, string memory normalized);
}
