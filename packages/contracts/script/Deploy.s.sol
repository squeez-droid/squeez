// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {LaunchConfig} from "../src/libraries/SqueezTypes.sol";

/// @notice Deploys the registry and factory using explicitly approved environment configuration.
/// Signs with DEPLOYER_PRIVATE_KEY when set (testnet), otherwise with the CLI signer (`--account` on mainnet).
contract Deploy is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_MULTISIG");
        address treasury = vm.envAddress("TREASURY");
        uint256 graduationThreshold = vm.envUint("GRADUATION_THRESHOLD_HYPE");
        uint256 virtualHypeReserve = vm.envUint("VIRTUAL_HYPE_RESERVE");
        uint256 virtualTokenReserve = vm.envUint("VIRTUAL_TOKEN_RESERVE");
        uint16 sniperTaxStartBps = uint16(vm.envUint("SNIPER_TAX_START_BPS"));
        uint32 sniperTaxDecaySeconds = uint32(vm.envUint("SNIPER_TAX_DECAY_SECONDS"));
        uint16 maxWalletBps = uint16(vm.envUint("MAX_WALLET_BPS"));
        uint32 maxWalletWindowSeconds = uint32(vm.envUint("MAX_WALLET_WINDOW_SECONDS"));
        uint256 launchFee = vm.envUint("LAUNCH_FEE_HYPE");

        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (deployerKey == 0) vm.startBroadcast();
        else vm.startBroadcast(deployerKey);

        SqueezQuoteRegistry registry = new SqueezQuoteRegistry(admin);
        new SqueezLaunchFactory(
            admin,
            registry,
            treasury,
            LaunchConfig({
                graduationThresholdHype: graduationThreshold,
                virtualHypeReserve: virtualHypeReserve,
                virtualTokenReserve: virtualTokenReserve,
                sniperTaxStartBps: sniperTaxStartBps,
                sniperTaxDecaySeconds: sniperTaxDecaySeconds,
                maxWalletBps: maxWalletBps,
                maxWalletWindowSeconds: maxWalletWindowSeconds,
                launchFeeHype: launchFee
            })
        );
        vm.stopBroadcast();
    }
}
