// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {SqueezHook, ISqueezHookVault} from "../src/SqueezHook.sol";

/// @notice Mines and deploys SqueezHook through the canonical deterministic CREATE2 deployer.
contract DeploySqueezHook is Script {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        address poolManager = vm.envAddress("POOL_MANAGER");
        address feeVault = vm.envAddress("FEE_VAULT_ADDRESS");
        require(poolManager.code.length > 0, "pool manager has no code");
        require(feeVault.code.length > 0, "fee vault has no code");
        require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer unavailable");

        bytes memory constructorArgs = abi.encode(IPoolManager(poolManager), ISqueezHookVault(feeVault));
        uint160 flags = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;
        (address expectedHook, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(SqueezHook).creationCode, constructorArgs);
        bytes memory initCode = abi.encodePacked(type(SqueezHook).creationCode, constructorArgs);

        uint256 signerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (signerKey == 0) signerKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        address deployer = vm.addr(signerKey);
        vm.startBroadcast(signerKey);
        (bool deployed,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
        vm.stopBroadcast();

        require(deployed && expectedHook.code.length > 0, "hook deployment failed");
        SqueezHook hook = SqueezHook(payable(expectedHook));
        require(address(hook.poolManager()) == poolManager, "hook manager");
        require(address(hook.feeVault()) == feeVault, "hook vault");

        string memory object = "squeezHook";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "deployer", deployer);
        vm.serializeAddress(object, "create2Deployer", CREATE2_DEPLOYER);
        vm.serializeBytes32(object, "salt", salt);
        vm.serializeAddress(object, "poolManager", poolManager);
        vm.serializeAddress(object, "feeVault", feeVault);
        string memory json = vm.serializeAddress(object, "squeezHook", expectedHook);
        vm.writeJson(json, _deploymentFile("-hook.json"));
    }

    function _deploymentFile(string memory suffix) private view returns (string memory) {
        string memory chain = vm.envString("SQUEEZ_CHAIN");
        string memory prefix = keccak256(bytes(chain)) == keccak256("elysium") ? "" : string.concat(chain, "/");
        return string.concat(vm.projectRoot(), "/deployments/", prefix, vm.envString("SQUEEZ_NETWORK"), suffix);
    }
}
