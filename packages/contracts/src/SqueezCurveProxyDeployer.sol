// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {SqueezCurve} from "./SqueezCurve.sol";
import {SqueezProtectionPolicyRegistry} from "./SqueezProtectionPolicyRegistry.sol";
import {ISqueezFeeVault} from "./interfaces/ISqueezFeeVault.sol";
import {LaunchConfig, LaunchParams} from "./libraries/SqueezTypes.sol";

/// @notice One-time-bound CREATE2 boundary that keeps BeaconProxy creation bytecode out of the launch factory.
contract SqueezCurveProxyDeployer {
    error Unauthorized();
    error AlreadyBound();

    address public immutable binder;
    address public immutable beacon;
    address public factory;

    event FactoryBound(address indexed factory);
    event CurveProxyDeployed(address indexed curve, bytes32 indexed salt);

    constructor(address binder_, address beacon_) {
        if (binder_ == address(0) || beacon_ == address(0) || beacon_.code.length == 0) revert Unauthorized();
        binder = binder_;
        beacon = beacon_;
    }

    function bindFactory(address factory_) external {
        if (msg.sender != binder || factory_ == address(0) || factory_.code.length == 0) revert Unauthorized();
        if (factory != address(0)) revert AlreadyBound();
        factory = factory_;
        emit FactoryBound(factory_);
    }

    function deploy(bytes32 salt, bytes calldata initializer) external returns (address curve) {
        if (msg.sender != factory) revert Unauthorized();
        curve = address(new BeaconProxy{salt: salt}(beacon, initializer));
        emit CurveProxyDeployed(curve, salt);
    }

    function curveInitializer(
        address launchFactory,
        address creator,
        LaunchParams calldata p,
        ISqueezFeeVault feeVault,
        LaunchConfig calldata cfg,
        SqueezProtectionPolicyRegistry protectionRegistry,
        uint256 activePolicyId
    ) external view returns (bytes memory initializer, uint256 policyId, bytes32 policyHash, bool valid) {
        policyId = activePolicyId;
        if (policyId == 0) {
            initializer = abi.encodeCall(
                SqueezCurve.initializeCurve,
                (launchFactory, creator, p.quote, p.feeRecipient, feeVault, p.creatorFeeBps, cfg, p.feeDestination)
            );
            return (initializer, policyId, policyHash, true);
        }
        SqueezProtectionPolicyRegistry.Policy memory policy = protectionRegistry.getPolicy(policyId);
        if (
            !policy.enabled || policy.initialFeeBps != cfg.sniperTaxStartBps
                || policy.protectionWindowSeconds != cfg.sniperTaxDecaySeconds
        ) return (initializer, policyId, policyHash, false);
        policyHash = policy.policyHash;
        SqueezCurve.ProtectionPolicyConfig memory curvePolicy = SqueezCurve.ProtectionPolicyConfig({
            policyId: policyId,
            policyHash: policyHash,
            protectionWindowSeconds: policy.protectionWindowSeconds,
            maxBuyBpsPerTransaction: policy.maxBuyBpsPerTransaction,
            maxBuyBpsPerAddress: policy.maxBuyBpsPerAddress
        });
        initializer = _protectedInitializer(launchFactory, creator, p, feeVault, cfg, curvePolicy);
        valid = true;
    }

    function _protectedInitializer(
        address launchFactory,
        address creator,
        LaunchParams calldata p,
        ISqueezFeeVault feeVault,
        LaunchConfig calldata cfg,
        SqueezCurve.ProtectionPolicyConfig memory curvePolicy
    ) private pure returns (bytes memory) {
        return abi.encodeCall(
            SqueezCurve.initializeCurveProtected,
            (
                launchFactory,
                creator,
                p.quote,
                p.feeRecipient,
                feeVault,
                p.creatorFeeBps,
                cfg,
                p.feeDestination,
                curvePolicy
            )
        );
    }
}
