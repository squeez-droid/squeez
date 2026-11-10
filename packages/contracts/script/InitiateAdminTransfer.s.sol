// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezProtectionPolicyRegistry} from "../src/SqueezProtectionPolicyRegistry.sol";
import {SqueezIdentityRegistry} from "../src/SqueezIdentityRegistry.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";

/// @notice Starts the two-step transfer of every UUPS admin to a deployed Safe contract.
/// The beacon intentionally remains with the current admin until the Safe accepts every pending ownership transfer.
contract InitiateAdminTransfer is Script {
    function run() external {
        address currentAdmin = vm.envAddress("ADMIN_MULTISIG");
        address nextAdmin = vm.envAddress("NEXT_ADMIN_MULTISIG");
        require(nextAdmin != address(0) && nextAdmin != currentAdmin, "invalid next admin");
        require(nextAdmin.code.length > 0, "next admin must be a contract");

        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        SqueezQuoteRegistry registry = SqueezQuoteRegistry(vm.envAddress("QUOTE_REGISTRY_ADDRESS"));
        SqueezProtectionPolicyRegistry policies =
            SqueezProtectionPolicyRegistry(vm.envAddress("PROTECTION_POLICY_REGISTRY_ADDRESS"));
        SqueezIdentityRegistry identities = SqueezIdentityRegistry(vm.envAddress("IDENTITY_REGISTRY_ADDRESS"));
        SqueezFeeVault vault = SqueezFeeVault(payable(vm.envAddress("FEE_VAULT_ADDRESS")));
        UpgradeableBeacon beacon = UpgradeableBeacon(vm.envAddress("CURVE_BEACON_ADDRESS"));

        require(factory.owner() == currentAdmin && factory.pendingOwner() == address(0), "factory admin state");
        require(registry.owner() == currentAdmin && registry.pendingOwner() == address(0), "registry admin state");
        require(policies.owner() == currentAdmin && policies.pendingOwner() == address(0), "policy admin state");
        require(identities.owner() == currentAdmin && identities.pendingOwner() == address(0), "identity admin state");
        require(vault.owner() == currentAdmin && vault.pendingOwner() == address(0), "vault admin state");
        require(beacon.owner() == currentAdmin, "beacon admin state");

        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == currentAdmin, "transfer signer is not current admin");
        vm.startBroadcast(adminKey);
        factory.transferOwnership(nextAdmin);
        registry.transferOwnership(nextAdmin);
        policies.transferOwnership(nextAdmin);
        identities.transferOwnership(nextAdmin);
        vault.transferOwnership(nextAdmin);
        vm.stopBroadcast();

        require(factory.pendingOwner() == nextAdmin, "factory pending owner");
        require(registry.pendingOwner() == nextAdmin, "registry pending owner");
        require(policies.pendingOwner() == nextAdmin, "policy pending owner");
        require(identities.pendingOwner() == nextAdmin, "identity pending owner");
        require(vault.pendingOwner() == nextAdmin, "vault pending owner");
        require(beacon.owner() == currentAdmin, "beacon moved before Safe acceptance");
    }
}
