// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";

/// @notice Sets the public attester address without placing its backend signing key on-chain or in the web bundle.
contract ConfigureAttester is Script {
    function run() external {
        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        address admin = vm.envAddress("ADMIN_MULTISIG");
        address attester = vm.envAddress("SQUEEZ_ATTESTER_ADDRESS");
        require(attester != address(0) && factory.owner() == admin, "invalid attester configuration");
        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == admin, "configuration signer is not admin");

        vm.startBroadcast(adminKey);
        factory.setAttester(attester);
        vm.stopBroadcast();

        string memory object = "attester";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "factory", address(factory));
        string memory json = vm.serializeAddress(object, "attester", attester);
        vm.writeJson(
            json,
            string.concat(
                vm.projectRoot(),
                "/deployments/",
                vm.envString("SQUEEZ_CHAIN"),
                "/",
                vm.envString("SQUEEZ_NETWORK"),
                "-attester.json"
            )
        );
    }
}
