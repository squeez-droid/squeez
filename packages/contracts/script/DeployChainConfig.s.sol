// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SqueezChainConfig} from "../src/SqueezChainConfig.sol";

/// @notice Deploys the append-only config registry. Publishing/activation is a separate governed operation.
contract DeployChainConfig is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_MULTISIG");
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (deployerKey == 0) vm.startBroadcast();
        else vm.startBroadcast(deployerKey);

        uint256 deploymentBlock = block.number;
        address implementation = address(new SqueezChainConfig());
        address proxy = address(new ERC1967Proxy(implementation, abi.encodeCall(SqueezChainConfig.initialize, (admin))));
        vm.stopBroadcast();

        string memory object = "chainConfigDeployment";
        string memory chain = vm.envString("SQUEEZ_CHAIN");
        string memory stage = vm.envString("SQUEEZ_NETWORK");
        vm.serializeString(object, "chain", chain);
        vm.serializeString(object, "network", stage);
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeUint(object, "chainConfigStartBlock", deploymentBlock);
        vm.serializeAddress(object, "chainConfigImplementation", implementation);
        string memory json = vm.serializeAddress(object, "chainConfig", proxy);
        if (!vm.envOr("DEPLOYMENT_DRY_RUN", false)) {
            string memory directory = string.concat(vm.projectRoot(), "/deployments/", chain);
            vm.createDir(directory, true);
            vm.writeJson(json, string.concat(directory, "/", stage, "-chain-config.json"));
        }
    }
}
