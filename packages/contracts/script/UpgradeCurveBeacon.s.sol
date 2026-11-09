// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";

/// @notice Upgrades every Curve BeaconProxy while preserving each curve address and storage.
contract UpgradeCurveBeacon is Script {
    function run() external {
        UpgradeableBeacon beacon = UpgradeableBeacon(vm.envAddress("CURVE_BEACON_ADDRESS"));
        address expectedAdmin = vm.envAddress("ADMIN_MULTISIG");
        require(beacon.owner() == expectedAdmin, "beacon owner");

        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == expectedAdmin, "upgrade signer is not admin");
        vm.startBroadcast(adminKey);
        address implementation = address(new SqueezCurve());
        beacon.upgradeTo(implementation);
        vm.stopBroadcast();

        require(beacon.implementation() == implementation, "beacon implementation");
        string memory object = "curveUpgrade";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "curveBeacon", address(beacon));
        string memory json = vm.serializeAddress(object, "curveImplementation", implementation);
        vm.writeJson(
            json,
            string.concat(vm.projectRoot(), "/deployments/", vm.envString("SQUEEZ_NETWORK"), "-curve-upgrade.json")
        );
    }
}
