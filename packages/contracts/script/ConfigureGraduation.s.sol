// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";

/// @notice Activates or pauses graduation after separately deploying and verifying the chain-specific adapter.
contract ConfigureGraduation is Script {
    function run() external {
        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        address expectedAdmin = vm.envAddress("ADMIN_MULTISIG");
        address adapter = vm.envAddress("GRADUATION_ADAPTER_ADDRESS");
        require(factory.owner() == expectedAdmin, "factory owner");
        require(adapter == address(0) || adapter.code.length > 0, "adapter has no code");

        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == expectedAdmin, "configuration signer is not admin");
        vm.startBroadcast(adminKey);
        factory.setGraduationAdapter(adapter);
        vm.stopBroadcast();
        require(factory.graduationAdapter() == adapter, "adapter configuration");

        string memory object = "graduation";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "factory", address(factory));
        string memory json = vm.serializeAddress(object, "graduationAdapter", adapter);
        vm.writeJson(
            json, string.concat(vm.projectRoot(), "/deployments/", vm.envString("SQUEEZ_NETWORK"), "-graduation.json")
        );
    }
}
