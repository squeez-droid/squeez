// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {LaunchConfig} from "../src/libraries/SqueezTypes.sol";

/// @notice Appends and activates a launch policy without mutating configs locked into existing curves.
contract ConfigureLaunchConfig is Script {
    function run() external {
        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        address expectedAdmin = vm.envAddress("ADMIN_MULTISIG");
        require(factory.owner() == expectedAdmin, "factory owner");

        uint256 threshold = vm.envUint("GRADUATION_THRESHOLD_HYPE");
        LaunchConfig memory config = LaunchConfig({
            graduationThresholdHype: threshold,
            virtualHypeReserve: vm.envOr("VIRTUAL_HYPE_RESERVE", threshold * 2 / 5),
            virtualTokenReserve: vm.envOr("VIRTUAL_TOKEN_RESERVE", uint256(1_000_000_000 ether)),
            sniperTaxStartBps: uint16(vm.envUint("SNIPER_TAX_START_BPS")),
            sniperTaxDecaySeconds: uint32(vm.envUint("SNIPER_TAX_DECAY_SECONDS")),
            maxWalletBps: uint16(vm.envUint("MAX_WALLET_BPS")),
            maxWalletWindowSeconds: uint32(vm.envUint("MAX_WALLET_WINDOW_SECONDS")),
            launchFeeHype: vm.envUint("LAUNCH_FEE_HYPE")
        });

        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == expectedAdmin, "configuration signer is not admin");
        vm.startBroadcast(adminKey);
        factory.setLaunchConfig(config);
        vm.stopBroadcast();

        uint256 configId = factory.activeConfigId();
        string memory object = "launchConfig";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "factory", address(factory));
        vm.serializeUint(object, "launchConfigId", configId);
        vm.serializeUint(object, "graduationThresholdHype", config.graduationThresholdHype);
        vm.serializeUint(object, "virtualHypeReserve", config.virtualHypeReserve);
        vm.serializeUint(object, "virtualTokenReserve", config.virtualTokenReserve);
        vm.serializeUint(object, "sniperTaxStartBps", config.sniperTaxStartBps);
        vm.serializeUint(object, "sniperTaxDecaySeconds", config.sniperTaxDecaySeconds);
        vm.serializeUint(object, "maxWalletBps", config.maxWalletBps);
        vm.serializeUint(object, "maxWalletWindowSeconds", config.maxWalletWindowSeconds);
        string memory json = vm.serializeUint(object, "launchFeeHype", config.launchFeeHype);
        vm.writeJson(
            json,
            string.concat(vm.projectRoot(), "/deployments/", vm.envString("SQUEEZ_NETWORK"), "-launch-config.json")
        );
    }
}
