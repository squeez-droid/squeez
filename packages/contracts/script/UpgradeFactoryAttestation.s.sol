// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";

/// @notice Deploys the required-attestation Factory implementation and optionally installs it on EOA-owned proxies.
/// Robinhood governance uses the emitted implementation address in a separate Safe/Timelock operation.
contract UpgradeFactoryAttestation is Script {
    function run() external {
        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        address expectedAdmin = vm.envAddress("ADMIN_MULTISIG");
        address expectedAttester = vm.envAddress("SQUEEZ_ATTESTER_ADDRESS");
        bool applyUpgrade = vm.envOr("APPLY_FACTORY_ATTESTATION_UPGRADE", false);
        require(factory.owner() == expectedAdmin, "factory owner");
        require(expectedAttester != address(0), "attester");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerKey);
        SqueezLaunchFactory implementation = new SqueezLaunchFactory();
        vm.stopBroadcast();

        if (applyUpgrade) {
            uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
            require(vm.addr(adminKey) == expectedAdmin, "upgrade signer is not admin");
            vm.startBroadcast(adminKey);
            factory.upgradeToAndCall(address(implementation), "");
            factory.setAttester(expectedAttester);
            vm.stopBroadcast();
            require(factory.attester() == expectedAttester, "attester state");
            require(!factory.attestationRequired(), "requirement activated early");
        }

        string memory object = "factoryAttestationUpgrade";
        vm.serializeString(object, "chain", vm.envString("SQUEEZ_CHAIN"));
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "factory", address(factory));
        vm.serializeAddress(object, "owner", factory.owner());
        vm.serializeAddress(object, "attester", expectedAttester);
        vm.serializeBool(object, "applied", applyUpgrade);
        string memory json = vm.serializeAddress(object, "factoryImplementation", address(implementation));
        vm.writeJson(
            json,
            string.concat(
                vm.projectRoot(),
                "/deployments/",
                vm.envString("SQUEEZ_CHAIN"),
                "/",
                vm.envString("SQUEEZ_NETWORK"),
                "-factory-attestation-upgrade.json"
            )
        );
    }
}
