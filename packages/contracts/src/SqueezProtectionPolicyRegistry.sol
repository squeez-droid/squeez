// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Append-only, versioned launch-protection policies. Tokens pin both the ID and canonical hash at launch.
contract SqueezProtectionPolicyRegistry is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable {
    error InvalidPolicy();
    error PolicyVersionExists();
    error UnknownPolicy();

    uint32 public constant MAX_PROTECTION_WINDOW_SECONDS = 1 days;
    uint16 public constant MAX_INITIAL_FEE_BPS = 9_900;
    uint16 public constant MAX_BUY_BPS_PER_TRANSACTION = 1_000;
    uint16 public constant MAX_BUY_BPS_PER_ADDRESS = 2_000;

    struct PolicyInput {
        bytes32 familyId;
        uint32 version;
        uint32 protectionWindowSeconds;
        uint16 initialFeeBps;
        uint16 maxBuyBpsPerTransaction;
        uint16 maxBuyBpsPerAddress;
    }

    struct Policy {
        bytes32 familyId;
        bytes32 policyHash;
        uint32 version;
        uint32 protectionWindowSeconds;
        uint16 initialFeeBps;
        uint16 maxBuyBpsPerTransaction;
        uint16 maxBuyBpsPerAddress;
        bool enabled;
    }

    uint256 public policyCount;
    mapping(uint256 policyId => Policy policy) private policies;
    mapping(bytes32 familyId => mapping(uint32 version => uint256 policyId)) public policyByFamilyVersion;

    event PolicyCreated(
        uint256 indexed policyId,
        bytes32 indexed familyId,
        uint32 indexed version,
        bytes32 policyHash,
        uint32 protectionWindowSeconds,
        uint16 initialFeeBps,
        uint16 maxBuyBpsPerTransaction,
        uint16 maxBuyBpsPerAddress
    );
    event PolicyEnabledSet(uint256 indexed policyId, bool enabled);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        if (admin == address(0)) revert InvalidPolicy();
        __Ownable_init(admin);
        __Ownable2Step_init();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function createPolicy(PolicyInput calldata input)
        external
        onlyOwner
        returns (uint256 policyId, bytes32 policyHash)
    {
        _validate(input);
        if (policyByFamilyVersion[input.familyId][input.version] != 0) revert PolicyVersionExists();

        policyHash = hashPolicy(input);
        policyId = ++policyCount;
        policies[policyId] = Policy({
            familyId: input.familyId,
            policyHash: policyHash,
            version: input.version,
            protectionWindowSeconds: input.protectionWindowSeconds,
            initialFeeBps: input.initialFeeBps,
            maxBuyBpsPerTransaction: input.maxBuyBpsPerTransaction,
            maxBuyBpsPerAddress: input.maxBuyBpsPerAddress,
            enabled: true
        });
        policyByFamilyVersion[input.familyId][input.version] = policyId;

        emit PolicyCreated(
            policyId,
            input.familyId,
            input.version,
            policyHash,
            input.protectionWindowSeconds,
            input.initialFeeBps,
            input.maxBuyBpsPerTransaction,
            input.maxBuyBpsPerAddress
        );
    }

    function setPolicyEnabled(uint256 policyId, bool enabled) external onlyOwner {
        if (policyId == 0 || policyId > policyCount) revert UnknownPolicy();
        policies[policyId].enabled = enabled;
        emit PolicyEnabledSet(policyId, enabled);
    }

    function getPolicy(uint256 policyId) external view returns (Policy memory) {
        if (policyId == 0 || policyId > policyCount) revert UnknownPolicy();
        return policies[policyId];
    }

    function hashPolicy(PolicyInput calldata input) public pure returns (bytes32) {
        return keccak256(
            abi.encode(
                input.familyId,
                input.version,
                input.protectionWindowSeconds,
                input.initialFeeBps,
                input.maxBuyBpsPerTransaction,
                input.maxBuyBpsPerAddress
            )
        );
    }

    function _validate(PolicyInput calldata input) private pure {
        if (
            input.familyId == bytes32(0) || input.version == 0 || input.protectionWindowSeconds == 0
                || input.protectionWindowSeconds > MAX_PROTECTION_WINDOW_SECONDS
                || input.initialFeeBps > MAX_INITIAL_FEE_BPS || input.maxBuyBpsPerTransaction == 0
                || input.maxBuyBpsPerTransaction > MAX_BUY_BPS_PER_TRANSACTION || input.maxBuyBpsPerAddress == 0
                || input.maxBuyBpsPerAddress > MAX_BUY_BPS_PER_ADDRESS
                || input.maxBuyBpsPerTransaction > input.maxBuyBpsPerAddress
        ) revert InvalidPolicy();
    }
}
