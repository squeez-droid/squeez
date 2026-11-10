// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Trust-minimized exact identity commitments and temporary/permanent ticker locks.
/// Heuristic look-alike detection remains an API concern and cannot mutate this registry.
contract SqueezIdentityRegistry is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable {
    error Unauthorized();
    error InvalidIdentity();
    error AlreadyRegistered();
    error ActiveIdentityLock();
    error InvalidLock();

    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_SYMBOL_LENGTH = 16;
    uint32 public constant MAX_TEMPORARY_LOCK_SECONDS = 1 days;

    struct IdentityInput {
        string name;
        string symbol;
        bytes32 metadataHash;
        bytes32 imageHash;
        bytes32 socialHash;
        uint32 templateVersion;
        bytes32 tokenCodeHash;
    }

    struct Identity {
        address creator;
        address curve;
        bytes32 canonicalHash;
        bytes32 nameCommitment;
        bytes32 symbolCommitment;
        bytes32 metadataHash;
        bytes32 imageHash;
        bytes32 socialHash;
        bytes32 tokenCodeHash;
        uint32 templateVersion;
        bool duplicateName;
        bool duplicateSymbol;
    }

    struct Lock {
        address originalToken;
        uint64 expiresAt;
        bool permanent;
    }

    address public factory;
    mapping(address token => Identity identity) private identities;
    mapping(address curve => address token) public tokenForCurve;
    mapping(bytes32 commitment => address token) public firstTokenByName;
    mapping(bytes32 commitment => address token) public firstTokenBySymbol;
    mapping(bytes32 commitment => Lock lock_) public nameLocks;
    mapping(bytes32 commitment => Lock lock_) public symbolLocks;
    mapping(bytes32 commitment => Lock lock_) public imageLocks;

    event FactorySet(address indexed factory);
    event IdentityRegistered(
        address indexed token,
        address indexed creator,
        address indexed curve,
        bytes32 canonicalHash,
        bytes32 nameCommitment,
        bytes32 symbolCommitment,
        bool duplicateName,
        bool duplicateSymbol
    );
    event IdentityEvidence(
        address indexed token,
        bytes32 metadataHash,
        bytes32 imageHash,
        bytes32 socialHash,
        bytes32 tokenCodeHash,
        uint32 templateVersion
    );
    event IdentityLocked(
        address indexed token,
        bytes32 indexed nameCommitment,
        bytes32 indexed symbolCommitment,
        bytes32 imageHash,
        uint64 expiresAt
    );
    event SymbolPermanentlyLocked(address indexed token, bytes32 indexed symbolCommitment);
    event SymbolReserved(bytes32 indexed symbolCommitment, string normalizedSymbol);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        if (admin == address(0)) revert InvalidIdentity();
        __Ownable_init(admin);
        __Ownable2Step_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setFactory(address factory_) external onlyOwner {
        if (factory_ == address(0) || factory_.code.length == 0) revert InvalidIdentity();
        factory = factory_;
        emit FactorySet(factory_);
    }

    function reserveSymbol(string calldata symbol) external onlyOwner {
        (bytes32 commitment, string memory normalized) = symbolCommitment(symbol);
        if (firstTokenBySymbol[commitment] != address(0)) revert AlreadyRegistered();
        Lock storage current = symbolLocks[commitment];
        if (current.permanent) revert ActiveIdentityLock();
        current.permanent = true;
        emit SymbolReserved(commitment, normalized);
    }

    function register(address token, address creator, address curve, IdentityInput calldata input)
        external
        returns (bytes32 canonicalHash)
    {
        if (msg.sender != factory) revert Unauthorized();
        if (
            token == address(0) || creator == address(0) || curve == address(0)
                || identities[token].creator != address(0)
        ) {
            revert InvalidIdentity();
        }
        (bytes32 nameHash,) = nameCommitment(input.name);
        (bytes32 symbolHash,) = symbolCommitment(input.symbol);
        _requireUnlocked(nameLocks[nameHash]);
        _requireUnlocked(symbolLocks[symbolHash]);
        if (input.imageHash != bytes32(0)) _requireUnlocked(imageLocks[input.imageHash]);

        address firstName = firstTokenByName[nameHash];
        address firstSymbol = firstTokenBySymbol[symbolHash];
        bool duplicateName = firstName != address(0);
        bool duplicateSymbol = firstSymbol != address(0);
        if (!duplicateName) firstTokenByName[nameHash] = token;
        if (!duplicateSymbol) firstTokenBySymbol[symbolHash] = token;

        canonicalHash = keccak256(
            abi.encode(
                nameHash,
                symbolHash,
                input.metadataHash,
                input.imageHash,
                input.socialHash,
                input.templateVersion,
                input.tokenCodeHash
            )
        );
        identities[token] = Identity({
            creator: creator,
            curve: curve,
            canonicalHash: canonicalHash,
            nameCommitment: nameHash,
            symbolCommitment: symbolHash,
            metadataHash: input.metadataHash,
            imageHash: input.imageHash,
            socialHash: input.socialHash,
            tokenCodeHash: input.tokenCodeHash,
            templateVersion: input.templateVersion,
            duplicateName: duplicateName,
            duplicateSymbol: duplicateSymbol
        });
        tokenForCurve[curve] = token;
        emit IdentityRegistered(
            token, creator, curve, canonicalHash, nameHash, symbolHash, duplicateName, duplicateSymbol
        );
        emit IdentityEvidence(
            token, input.metadataHash, input.imageHash, input.socialHash, input.tokenCodeHash, input.templateVersion
        );
    }

    function lockIdentity(uint32 durationSeconds) external {
        address token = tokenForCurve[msg.sender];
        if (token == address(0)) revert Unauthorized();
        if (durationSeconds == 0 || durationSeconds > MAX_TEMPORARY_LOCK_SECONDS) revert InvalidLock();
        Identity storage identity = identities[token];
        uint64 expiresAt = uint64(block.timestamp + durationSeconds);
        _setTemporaryLock(nameLocks[identity.nameCommitment], token, expiresAt);
        _setTemporaryLock(symbolLocks[identity.symbolCommitment], token, expiresAt);
        if (identity.imageHash != bytes32(0)) _setTemporaryLock(imageLocks[identity.imageHash], token, expiresAt);
        emit IdentityLocked(token, identity.nameCommitment, identity.symbolCommitment, identity.imageHash, expiresAt);
    }

    function permanentlyLockSymbol() external {
        address token = tokenForCurve[msg.sender];
        if (token == address(0)) revert Unauthorized();
        bytes32 commitment = identities[token].symbolCommitment;
        Lock storage current = symbolLocks[commitment];
        if (current.originalToken != address(0) && current.originalToken != token) revert ActiveIdentityLock();
        current.originalToken = token;
        current.expiresAt = 0;
        current.permanent = true;
        emit SymbolPermanentlyLocked(token, commitment);
    }

    function getIdentity(address token) external view returns (Identity memory) {
        return identities[token];
    }

    function nameCommitment(string calldata value) public pure returns (bytes32 commitment, string memory normalized) {
        normalized = normalize(value, MAX_NAME_LENGTH);
        commitment = keccak256(bytes(normalized));
    }

    function symbolCommitment(string calldata value)
        public
        pure
        returns (bytes32 commitment, string memory normalized)
    {
        normalized = normalize(value, MAX_SYMBOL_LENGTH);
        commitment = keccak256(bytes(normalized));
    }

    function normalize(string calldata value, uint256 maxLength) public pure returns (string memory) {
        bytes calldata source = bytes(value);
        if (source.length == 0 || source.length > maxLength + 2) revert InvalidIdentity();
        uint256 start;
        while (start < source.length && source[start] == 0x20) start++;
        uint256 end = source.length;
        while (end > start && source[end - 1] == 0x20) end--;
        uint256 length = end - start;
        if (length == 0 || length > maxLength) revert InvalidIdentity();
        bytes memory result = new bytes(length);
        for (uint256 i; i < length; ++i) {
            uint8 character = uint8(source[start + i]);
            if (character < 0x20 || character > 0x7e) revert InvalidIdentity();
            if (character >= 0x41 && character <= 0x5a) character += 0x20;
            result[i] = bytes1(character);
        }
        return string(result);
    }

    function _requireUnlocked(Lock storage current) private view {
        if (current.permanent || current.expiresAt > block.timestamp) revert ActiveIdentityLock();
    }

    function _setTemporaryLock(Lock storage current, address token, uint64 expiresAt) private {
        if (current.permanent || (current.expiresAt > block.timestamp && current.originalToken != token)) {
            revert ActiveIdentityLock();
        }
        if (expiresAt > current.expiresAt) current.expiresAt = expiresAt;
        current.originalToken = token;
    }
}
