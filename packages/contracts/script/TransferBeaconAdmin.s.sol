// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezProtectionPolicyRegistry} from "../src/SqueezProtectionPolicyRegistry.sol";
import {SqueezIdentityRegistry} from "../src/SqueezIdentityRegistry.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

/// @notice Finalizes admin migration after the Safe has accepted all two-step UUPS ownership transfers.
contract TransferBeaconAdmin is Script {
    function run() external {
        address currentAdmin = vm.envAddress("ADMIN_MULTISIG");
        address safe = vm.envAddress("NEXT_ADMIN_MULTISIG");
        require(safe != address(0) && safe.code.length > 0, "invalid Safe");

        require(SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS"))).owner() == safe, "factory owner");
        require(SqueezQuoteRegistry(vm.envAddress("QUOTE_REGISTRY_ADDRESS")).owner() == safe, "registry owner");
        require(
            SqueezProtectionPolicyRegistry(vm.envAddress("PROTECTION_POLICY_REGISTRY_ADDRESS")).owner() == safe,
            "policy owner"
        );
        require(SqueezIdentityRegistry(vm.envAddress("IDENTITY_REGISTRY_ADDRESS")).owner() == safe, "identity owner");
        require(SqueezFeeVault(payable(vm.envAddress("FEE_VAULT_ADDRESS"))).owner() == safe, "vault owner");

        UpgradeableBeacon beacon = UpgradeableBeacon(vm.envAddress("CURVE_BEACON_ADDRESS"));
        require(beacon.owner() == currentAdmin, "beacon current owner");
        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == currentAdmin, "transfer signer is not current admin");

        vm.startBroadcast(adminKey);
        beacon.transferOwnership(safe);
        vm.stopBroadcast();

        require(beacon.owner() == safe, "beacon owner not Safe");
    }
}
