// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {SqueezSwapRouter} from "../src/SqueezSwapRouter.sol";

contract DeploySwapRouter is Script {
    function run() external {
        address manager = vm.envAddress("POOL_MANAGER");
        address hook = vm.envAddress("SQUEEZ_HOOK_ADDRESS");
        require(manager.code.length > 0 && hook.code.length > 0, "v4 dependency has no code");
        uint256 signerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (signerKey == 0) signerKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        address deployer = vm.addr(signerKey);
        vm.startBroadcast(signerKey);
        SqueezSwapRouter router = new SqueezSwapRouter(IPoolManager(manager), IHooks(hook));
        vm.stopBroadcast();
        require(address(router.poolManager()) == manager && address(router.hook()) == hook, "router wiring");

        string memory object = "swapRouter";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "deployer", deployer);
        vm.serializeAddress(object, "poolManager", manager);
        vm.serializeAddress(object, "squeezHook", hook);
        string memory json = vm.serializeAddress(object, "swapRouter", address(router));
        vm.writeJson(
            json, string.concat(vm.projectRoot(), "/deployments/", vm.envString("SQUEEZ_NETWORK"), "-swap-router.json")
        );
    }
}
