// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @notice Append-only chain configuration. A launch pins a version; publishing a new version never mutates old data.
contract SqueezChainConfig is Initializable, Ownable2StepUpgradeable, UUPSUpgradeable {
    error InvalidConfig();
    error ConfigVersionExists();
    error UnknownConfigVersion();

    struct ConfigInput {
        uint256 chainId;
        address wrappedNative;
        uint256 launchFee;
        uint256 graduationThreshold;
        uint32 protectionWindowSec;
        uint32 avgBlockTimeMs;
        address graduationAdapter;
        address quoteRegistry;
        address oracleGuard;
        address buybackRoute;
        uint32 configVersion;
    }

    struct Config {
        uint256 chainId;
        address wrappedNative;
        uint256 launchFee;
        uint256 graduationThreshold;
        uint32 protectionWindowSec;
        uint32 avgBlockTimeMs;
        address graduationAdapter;
        address quoteRegistry;
        address oracleGuard;
        address buybackRoute;
        uint32 configVersion;
        bytes32 configHash;
    }

    uint32 public activeConfigVersion;
    mapping(uint32 version => Config config) private configs;

    event ConfigPublished(uint32 indexed version, bytes32 indexed configHash, Config config);
    event ActiveConfigVersionSet(uint32 indexed previousVersion, uint32 indexed newVersion);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        if (admin == address(0)) revert InvalidConfig();
        __Ownable_init(admin);
        __Ownable2Step_init();
    }

    function publishConfig(ConfigInput calldata input, bool activate) external onlyOwner returns (bytes32 configHash) {
        _validate(input);
        if (configs[input.configVersion].configVersion != 0) revert ConfigVersionExists();
        configHash = hashConfig(input);
        Config memory config = Config({
            chainId: input.chainId,
            wrappedNative: input.wrappedNative,
            launchFee: input.launchFee,
            graduationThreshold: input.graduationThreshold,
            protectionWindowSec: input.protectionWindowSec,
            avgBlockTimeMs: input.avgBlockTimeMs,
            graduationAdapter: input.graduationAdapter,
            quoteRegistry: input.quoteRegistry,
            oracleGuard: input.oracleGuard,
            buybackRoute: input.buybackRoute,
            configVersion: input.configVersion,
            configHash: configHash
        });
        configs[input.configVersion] = config;
        emit ConfigPublished(input.configVersion, configHash, config);
        if (activate) _setActiveConfigVersion(input.configVersion);
    }

    function setActiveConfigVersion(uint32 version) external onlyOwner {
        _setActiveConfigVersion(version);
    }

    function getConfig(uint32 version) external view returns (Config memory) {
        if (configs[version].configVersion == 0) revert UnknownConfigVersion();
        return configs[version];
    }

    function getActiveConfig() external view returns (Config memory) {
        uint32 version = activeConfigVersion;
        if (version == 0) revert UnknownConfigVersion();
        return configs[version];
    }

    function hashConfig(ConfigInput calldata input) public pure returns (bytes32) {
        return keccak256(abi.encode(input));
    }

    function _setActiveConfigVersion(uint32 version) private {
        if (configs[version].configVersion == 0) revert UnknownConfigVersion();
        uint32 previous = activeConfigVersion;
        activeConfigVersion = version;
        emit ActiveConfigVersionSet(previous, version);
    }

    function _validate(ConfigInput calldata input) private view {
        if (
            input.chainId != block.chainid || input.wrappedNative == address(0) || input.wrappedNative.code.length == 0
                || input.launchFee == 0 || input.graduationThreshold == 0 || input.protectionWindowSec == 0
                || input.avgBlockTimeMs == 0 || input.graduationAdapter == address(0)
                || input.graduationAdapter.code.length == 0 || input.quoteRegistry == address(0)
                || input.quoteRegistry.code.length == 0 || input.buybackRoute == address(0)
                || input.buybackRoute.code.length == 0 || input.configVersion == 0
        ) revert InvalidConfig();
        if (input.oracleGuard != address(0) && input.oracleGuard.code.length == 0) revert InvalidConfig();
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}
