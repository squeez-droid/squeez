// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";

/// @notice Authorizes the deployed v4 hook to deposit protocol and creator fees into FeeVault.
contract ConfigureSqueezHook is Script {
    function run() external {
        SqueezFeeVault vault = SqueezFeeVault(payable(vm.envAddress("FEE_VAULT_ADDRESS")));
        address hook = vm.envAddress("SQUEEZ_HOOK_ADDRESS");
        address expectedAdmin = vm.envAddress("ADMIN_MULTISIG");
        require(vault.owner() == expectedAdmin, "vault owner");
        require(hook.code.length > 0, "hook has no code");

        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        require(vm.addr(adminKey) == expectedAdmin, "configuration signer is not admin");
        vm.startBroadcast(adminKey);
        vault.setHook(hook);
        vm.stopBroadcast();
        require(vault.hook() == hook, "hook configuration");

        string memory object = "hookConfig";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "feeVault", address(vault));
        string memory json = vm.serializeAddress(object, "squeezHook", hook);
        vm.writeJson(json, _deploymentFile("-hook-config.json"));
    }

    function _deploymentFile(string memory suffix) private view returns (string memory) {
        string memory chain = vm.envString("SQUEEZ_CHAIN");
        string memory prefix = keccak256(bytes(chain)) == keccak256("elysium") ? "" : string.concat(chain, "/");
        return string.concat(vm.projectRoot(), "/deployments/", prefix, vm.envString("SQUEEZ_NETWORK"), suffix);
    }
}
