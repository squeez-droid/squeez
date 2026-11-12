// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {SqueezTokenUpgradeable} from "../src/SqueezTokenUpgradeable.sol";

/// @notice Upgrades every token BeaconProxy while preserving token addresses and storage.
contract UpgradeTokenBeacon is Script {
    function run() external {
        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        UpgradeableBeacon beacon = UpgradeableBeacon(vm.envAddress("TOKEN_BEACON_ADDRESS"));
        vm.startBroadcast(adminKey);
        address implementation = address(new SqueezTokenUpgradeable());
        beacon.upgradeTo(implementation);
        vm.stopBroadcast();

        string memory object = "tokenUpgrade";
        vm.serializeString(object, "chain", vm.envString("SQUEEZ_CHAIN"));
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "tokenBeacon", address(beacon));
        string memory json = vm.serializeAddress(object, "tokenImplementation", implementation);
        string memory path = string.concat(
            vm.projectRoot(),
            "/deployments/",
            vm.envString("SQUEEZ_CHAIN"),
            "/",
            vm.envString("SQUEEZ_NETWORK"),
            "-token-upgrade.json"
        );
        vm.writeJson(json, path);
    }
}
