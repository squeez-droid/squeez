// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {SqueezTokenUpgradeable} from "../src/SqueezTokenUpgradeable.sol";
import {SqueezTokenDeployer} from "../src/SqueezTokenDeployer.sol";

/// @notice Deploys the token beacon/template and a factory-bound deployer.
/// @dev Governance must separately call factory.setLaunchDeployers(newTokenDeployer, currentCurveProxyDeployer).
contract DeployTokenProxyInfrastructure is Script {
    function run() external {
        address admin = vm.envAddress("ADMIN_MULTISIG");
        address factory = vm.envAddress("FACTORY_ADDRESS");
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        address deployer = deployerKey == 0 ? vm.envAddress("DEPLOYER_ADDRESS") : vm.addr(deployerKey);

        if (deployerKey == 0) vm.startBroadcast();
        else vm.startBroadcast(deployerKey);
        address implementation = address(new SqueezTokenUpgradeable());
        address beacon = address(new UpgradeableBeacon(implementation, admin));
        SqueezTokenDeployer tokenDeployer = new SqueezTokenDeployer(deployer, beacon);
        tokenDeployer.bindFactory(factory);
        vm.stopBroadcast();

        string memory object = "tokenProxy";
        vm.serializeString(object, "chain", vm.envString("SQUEEZ_CHAIN"));
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "tokenImplementation", implementation);
        vm.serializeAddress(object, "tokenBeacon", beacon);
        string memory json = vm.serializeAddress(object, "tokenDeployer", address(tokenDeployer));
        string memory path = string.concat(
            vm.projectRoot(),
            "/deployments/",
            vm.envString("SQUEEZ_CHAIN"),
            "/",
            vm.envString("SQUEEZ_NETWORK"),
            "-token-proxy.json"
        );
        vm.writeJson(json, path);
    }
}
