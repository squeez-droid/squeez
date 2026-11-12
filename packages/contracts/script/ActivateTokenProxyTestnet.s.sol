// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezTokenDeployer} from "../src/SqueezTokenDeployer.sol";
import {SqueezCurveProxyDeployer} from "../src/SqueezCurveProxyDeployer.sol";

/// @notice Testnet-only activation of the proxy token template on a legacy Factory deployment.
contract ActivateTokenProxyTestnet is Script {
    function run() external {
        uint256 adminKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        address admin = vm.addr(adminKey);
        SqueezLaunchFactory factory = SqueezLaunchFactory(payable(vm.envAddress("FACTORY_ADDRESS")));
        SqueezTokenDeployer tokenDeployer = SqueezTokenDeployer(vm.envAddress("TOKEN_DEPLOYER_ADDRESS"));
        address curveBeacon = vm.envAddress("CURVE_BEACON_ADDRESS");

        require(factory.owner() == admin, "admin is not factory owner");
        require(tokenDeployer.factory() == address(factory), "token deployer not bound");

        vm.startBroadcast(adminKey);
        address factoryImplementation = address(new SqueezLaunchFactory());
        SqueezCurveProxyDeployer curveProxyDeployer = new SqueezCurveProxyDeployer(admin, curveBeacon);
        curveProxyDeployer.bindFactory(address(factory));
        factory.upgradeToAndCall(factoryImplementation, bytes(""));
        factory.setLaunchDeployers(tokenDeployer, curveProxyDeployer);
        vm.stopBroadcast();

        string memory object = "tokenProxyActivation";
        vm.serializeString(object, "chain", vm.envString("SQUEEZ_CHAIN"));
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "factoryImplementation", factoryImplementation);
        vm.serializeAddress(object, "tokenDeployer", address(tokenDeployer));
        string memory json = vm.serializeAddress(object, "curveProxyDeployer", address(curveProxyDeployer));
        string memory path = string.concat(
            vm.projectRoot(),
            "/deployments/",
            vm.envString("SQUEEZ_CHAIN"),
            "/",
            vm.envString("SQUEEZ_NETWORK"),
            "-token-proxy-activation.json"
        );
        vm.writeJson(json, path);
    }
}
