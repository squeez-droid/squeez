// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";

/// @notice Upgrades the three UUPS core proxies without changing their stable addresses or state.
contract UpgradeCore is Script {
    struct Snapshot {
        address registry;
        address vault;
        address treasury;
        address curveBeacon;
        uint256 activeConfigId;
    }

    struct Implementations {
        address registry;
        address vault;
        address factory;
    }

    function run() external {
        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        SqueezQuoteRegistry registry = SqueezQuoteRegistry(vm.envAddress("QUOTE_REGISTRY_ADDRESS"));
        SqueezFeeVault vault = SqueezFeeVault(payable(vm.envAddress("FEE_VAULT_ADDRESS")));
        address expectedAdmin = vm.envAddress("ADMIN_MULTISIG");

        require(factory.owner() == expectedAdmin, "factory owner");
        require(registry.owner() == expectedAdmin, "registry owner");
        require(vault.owner() == expectedAdmin, "vault owner");

        Snapshot memory beforeState = Snapshot({
            registry: address(factory.quoteRegistry()),
            vault: address(factory.feeVault()),
            treasury: factory.treasury(),
            curveBeacon: factory.curveBeacon(),
            activeConfigId: factory.activeConfigId()
        });

        uint256 adminKey = vm.envOr("UPGRADE_ADMIN_PRIVATE_KEY", uint256(0));
        require(adminKey != 0 && vm.addr(adminKey) == expectedAdmin, "upgrade signer is not admin");
        vm.startBroadcast(adminKey);

        Implementations memory next = Implementations({
            registry: address(new SqueezQuoteRegistry()),
            vault: address(new SqueezFeeVault()),
            factory: address(new SqueezLaunchFactory())
        });
        registry.upgradeToAndCall(next.registry, "");
        vault.upgradeToAndCall(next.vault, "");
        factory.upgradeToAndCall(next.factory, "");

        vm.stopBroadcast();

        require(factory.owner() == expectedAdmin && factory.pendingOwner() == address(0), "factory admin state");
        require(registry.owner() == expectedAdmin && registry.pendingOwner() == address(0), "registry admin state");
        require(vault.owner() == expectedAdmin && vault.pendingOwner() == address(0), "vault admin state");
        require(address(factory.quoteRegistry()) == beforeState.registry, "registry wiring");
        require(address(factory.feeVault()) == beforeState.vault, "vault wiring");
        require(factory.treasury() == beforeState.treasury, "treasury state");
        require(factory.curveBeacon() == beforeState.curveBeacon, "beacon state");
        require(factory.activeConfigId() == beforeState.activeConfigId, "config state");
        require(registry.isActive(address(0)), "native quote state");
        require(vault.treasury() == beforeState.treasury, "vault treasury state");

        string memory object = "upgrade";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "quoteRegistry", address(registry));
        vm.serializeAddress(object, "quoteRegistryImplementation", next.registry);
        vm.serializeAddress(object, "feeVault", address(vault));
        vm.serializeAddress(object, "feeVaultImplementation", next.vault);
        vm.serializeAddress(object, "factory", address(factory));
        string memory json = vm.serializeAddress(object, "factoryImplementation", next.factory);
        vm.writeJson(
            json, string.concat(vm.projectRoot(), "/deployments/", vm.envString("SQUEEZ_NETWORK"), "-core-upgrade.json")
        );
    }
}
