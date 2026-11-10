// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezProtectionPolicyRegistry} from "../src/SqueezProtectionPolicyRegistry.sol";
import {SqueezIdentityRegistry} from "../src/SqueezIdentityRegistry.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {LaunchConfig} from "../src/libraries/SqueezTypes.sol";
import {SqueezConstants} from "../src/libraries/SqueezConstants.sol";

/// @notice Deploys the registry and factory using explicitly approved environment configuration.
/// Signs with DEPLOYER_PRIVATE_KEY when set (testnet), otherwise with the CLI signer (`--account` on mainnet).
contract Deploy is Script {
    struct Deployment {
        address registry;
        address registryImplementation;
        address feeVault;
        address feeVaultImplementation;
        address curveBeacon;
        address curveImplementation;
        address factory;
        address factoryImplementation;
        address protectionPolicyRegistry;
        address protectionPolicyRegistryImplementation;
        address identityRegistry;
        address identityRegistryImplementation;
    }

    function run() external {
        address admin = vm.envAddress("ADMIN_MULTISIG");
        address treasury = vm.envAddress("TREASURY");
        LaunchConfig memory launchConfig = _launchConfig();

        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (deployerKey == 0) vm.startBroadcast();
        else vm.startBroadcast(deployerKey);

        uint256 deploymentBlock = block.number;
        Deployment memory deployment;
        (deployment.registry, deployment.registryImplementation) = _deployRegistry(admin);
        (deployment.protectionPolicyRegistry, deployment.protectionPolicyRegistryImplementation) =
            _deployProtectionPolicyRegistry(admin);
        (deployment.identityRegistry, deployment.identityRegistryImplementation) = _deployIdentityRegistry(admin);
        (deployment.feeVault, deployment.feeVaultImplementation) = _deployVault(admin, treasury);
        (deployment.curveBeacon, deployment.curveImplementation) = _deployCurveBeacon(admin);
        (deployment.factory, deployment.factoryImplementation) = _deployFactory(
            admin, treasury, deployment.registry, deployment.feeVault, deployment.curveBeacon, launchConfig
        );
        vm.stopBroadcast();

        string memory object = "deployment";
        string memory chain = vm.envString("SQUEEZ_CHAIN");
        string memory stage = vm.envString("SQUEEZ_NETWORK");
        vm.serializeString(object, "chain", chain);
        vm.serializeString(object, "network", stage);
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeUint(object, "startBlock", deploymentBlock);
        vm.serializeAddress(object, "quoteRegistry", deployment.registry);
        vm.serializeAddress(object, "quoteRegistryImplementation", deployment.registryImplementation);
        vm.serializeAddress(object, "feeVault", deployment.feeVault);
        vm.serializeAddress(object, "feeVaultImplementation", deployment.feeVaultImplementation);
        vm.serializeAddress(object, "curveBeacon", deployment.curveBeacon);
        vm.serializeAddress(object, "curveImplementation", deployment.curveImplementation);
        vm.serializeAddress(object, "factoryImplementation", deployment.factoryImplementation);
        vm.serializeAddress(object, "protectionPolicyRegistry", deployment.protectionPolicyRegistry);
        vm.serializeAddress(
            object, "protectionPolicyRegistryImplementation", deployment.protectionPolicyRegistryImplementation
        );
        vm.serializeAddress(object, "identityRegistry", deployment.identityRegistry);
        vm.serializeAddress(object, "identityRegistryImplementation", deployment.identityRegistryImplementation);
        string memory json = vm.serializeAddress(object, "factory", deployment.factory);
        if (!vm.envOr("DEPLOYMENT_DRY_RUN", false)) {
            string memory directory = string.concat(vm.projectRoot(), "/deployments/", chain);
            vm.createDir(directory, true);
            vm.writeJson(json, string.concat(directory, "/", stage, ".json"));
        }
    }

    function _deployRegistry(address admin) private returns (address proxy, address implementation) {
        implementation = address(new SqueezQuoteRegistry());
        proxy = address(new ERC1967Proxy(implementation, abi.encodeCall(SqueezQuoteRegistry.initialize, (admin))));
    }

    function _deployProtectionPolicyRegistry(address admin) private returns (address proxy, address implementation) {
        implementation = address(new SqueezProtectionPolicyRegistry());
        proxy = address(
            new ERC1967Proxy(implementation, abi.encodeCall(SqueezProtectionPolicyRegistry.initialize, (admin)))
        );
    }

    function _deployIdentityRegistry(address admin) private returns (address proxy, address implementation) {
        implementation = address(new SqueezIdentityRegistry());
        proxy = address(new ERC1967Proxy(implementation, abi.encodeCall(SqueezIdentityRegistry.initialize, (admin))));
    }

    function _deployVault(address admin, address treasury) private returns (address proxy, address implementation) {
        implementation = address(new SqueezFeeVault());
        proxy = address(new ERC1967Proxy(implementation, abi.encodeCall(SqueezFeeVault.initialize, (admin, treasury))));
    }

    function _deployCurveBeacon(address admin) private returns (address beacon, address implementation) {
        implementation = address(new SqueezCurve());
        beacon = address(new UpgradeableBeacon(implementation, admin));
    }

    function _deployFactory(
        address admin,
        address treasury,
        address registry,
        address vault,
        address beacon,
        LaunchConfig memory config
    ) private returns (address proxy, address implementation) {
        implementation = address(new SqueezLaunchFactory());
        proxy = address(
            new ERC1967Proxy(
                implementation,
                abi.encodeCall(
                    SqueezLaunchFactory.initialize,
                    (admin, SqueezQuoteRegistry(registry), SqueezFeeVault(payable(vault)), treasury, beacon, config)
                )
            )
        );
    }

    function _launchConfig() private view returns (LaunchConfig memory) {
        uint256 graduationThreshold = vm.envUint("GRADUATION_THRESHOLD_HYPE");
        return LaunchConfig({
            graduationThresholdHype: graduationThreshold,
            virtualHypeReserve: (graduationThreshold * 2) / 5,
            virtualTokenReserve: SqueezConstants.TOTAL_SUPPLY,
            sniperTaxStartBps: uint16(vm.envUint("SNIPER_TAX_START_BPS")),
            sniperTaxDecaySeconds: uint32(vm.envUint("SNIPER_TAX_DECAY_SECONDS")),
            maxWalletBps: uint16(vm.envUint("MAX_WALLET_BPS")),
            maxWalletWindowSeconds: uint32(vm.envUint("MAX_WALLET_WINDOW_SECONDS")),
            launchFeeHype: vm.envUint("LAUNCH_FEE_HYPE")
        });
    }
}
