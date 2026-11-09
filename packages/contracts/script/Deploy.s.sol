// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {LaunchConfig} from "../src/libraries/SqueezTypes.sol";

/// @notice Deploys the registry and factory using explicitly approved environment configuration.
/// Signs with DEPLOYER_PRIVATE_KEY when set (testnet), otherwise with the CLI signer (`--account` on mainnet).
contract Deploy is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_MULTISIG");
        address treasury = vm.envAddress("TREASURY");
        LaunchConfig memory launchConfig = _launchConfig();

        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (deployerKey == 0) vm.startBroadcast();
        else vm.startBroadcast(deployerKey);

        SqueezQuoteRegistry registry = new SqueezQuoteRegistry(admin);
        SqueezFeeVault feeVault = new SqueezFeeVault(admin, treasury);
        new SqueezLaunchFactory(admin, registry, feeVault, treasury, launchConfig);
        vm.stopBroadcast();
    }

    function _launchConfig() private view returns (LaunchConfig memory) {
        return LaunchConfig({
            graduationThresholdHype: vm.envUint("GRADUATION_THRESHOLD_HYPE"),
            virtualHypeReserve: vm.envUint("VIRTUAL_HYPE_RESERVE"),
            virtualTokenReserve: vm.envUint("VIRTUAL_TOKEN_RESERVE"),
            sniperTaxStartBps: uint16(vm.envUint("SNIPER_TAX_START_BPS")),
            sniperTaxDecaySeconds: uint32(vm.envUint("SNIPER_TAX_DECAY_SECONDS")),
            maxWalletBps: uint16(vm.envUint("MAX_WALLET_BPS")),
            maxWalletWindowSeconds: uint32(vm.envUint("MAX_WALLET_WINDOW_SECONDS")),
            launchFeeHype: vm.envUint("LAUNCH_FEE_HYPE")
        });
    }
}
