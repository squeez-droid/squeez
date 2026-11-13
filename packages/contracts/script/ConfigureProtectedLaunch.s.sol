// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezProtectionPolicyRegistry} from "../src/SqueezProtectionPolicyRegistry.sol";
import {SqueezIdentityRegistry} from "../src/SqueezIdentityRegistry.sol";
import {ISqueezIdentityRegistry} from "../src/interfaces/ISqueezIdentityRegistry.sol";

/// @notice Atomically wires the anti-sniper, identity, and optional creator-attestation policy after deployment.
contract ConfigureProtectedLaunch is Script {
    function run() external {
        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        SqueezProtectionPolicyRegistry policies =
            SqueezProtectionPolicyRegistry(vm.envAddress("PROTECTION_POLICY_REGISTRY_ADDRESS"));
        SqueezIdentityRegistry identities = SqueezIdentityRegistry(vm.envAddress("IDENTITY_REGISTRY_ADDRESS"));
        address admin = vm.envAddress("ADMIN_MULTISIG");
        address attester = vm.envOr("SQUEEZ_ATTESTER_ADDRESS", address(0));
        uint32 lockSeconds = uint32(vm.envUint("TICKER_LOCK_SECONDS"));

        require(factory.owner() == admin && policies.owner() == admin && identities.owner() == admin, "admin mismatch");
        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == admin, "configuration signer is not admin");

        vm.startBroadcast(adminKey);
        uint256 policyId;
        bytes32 policyHash;
        // Policies are immutable snapshots. Reconfiguration creates the next version and
        // activates it, so an existing testnet deployment can be repaired without resets.
        uint32 policyVersion = uint32(policies.policyCount() + 1);
        (policyId, policyHash) = policies.createPolicy(
            SqueezProtectionPolicyRegistry.PolicyInput({
                familyId: keccak256("squeez.protected-launch"),
                version: policyVersion,
                protectionWindowSeconds: uint32(vm.envUint("SNIPER_TAX_DECAY_SECONDS")),
                initialFeeBps: uint16(vm.envUint("SNIPER_TAX_START_BPS")),
                maxBuyBpsPerTransaction: uint16(vm.envUint("MAX_BUY_BPS_PER_TRANSACTION")),
                maxBuyBpsPerAddress: uint16(vm.envUint("MAX_WALLET_BPS"))
            })
        );
        identities.setFactory(address(factory));
        factory.setIdentityRegistry(ISqueezIdentityRegistry(address(identities)), lockSeconds);
        factory.setProtectionPolicy(policies, policyId);
        if (attester != address(0)) factory.setAttester(attester);
        vm.stopBroadcast();

        string memory object = "protectedLaunch";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "factory", address(factory));
        vm.serializeAddress(object, "protectionPolicyRegistry", address(policies));
        vm.serializeUint(object, "protectionPolicyId", policyId);
        vm.serializeUint(object, "protectionPolicyVersion", policyVersion);
        vm.serializeBytes32(object, "protectionPolicyHash", policyHash);
        vm.serializeAddress(object, "identityRegistry", address(identities));
        vm.serializeUint(object, "tickerLockSeconds", lockSeconds);
        string memory json = vm.serializeAddress(object, "attester", attester);
        vm.writeJson(
            json,
            string.concat(
                vm.projectRoot(),
                "/deployments/",
                vm.envString("SQUEEZ_CHAIN"),
                "/",
                vm.envString("SQUEEZ_NETWORK"),
                "-protected-launch.json"
            )
        );
    }
}
