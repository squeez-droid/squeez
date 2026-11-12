// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezCurveProxyDeployer} from "../src/SqueezCurveProxyDeployer.sol";

/// @notice Deploys passive prerequisites for the governance-controlled mainnet token-proxy activation.
/// @dev This script does not call or upgrade the live Factory.
contract DeployTokenProxyActivationMainnet is Script {
    function run() external {
        require(keccak256(bytes(vm.envString("SQUEEZ_CHAIN"))) == keccak256("robinhood"), "wrong chain");
        require(keccak256(bytes(vm.envString("SQUEEZ_NETWORK"))) == keccak256("mainnet"), "wrong network");
        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address governance = vm.envAddress("ADMIN_MULTISIG");
        address factory = vm.envAddress("FACTORY_ADDRESS");
        address curveBeacon = vm.envAddress("CURVE_BEACON_ADDRESS");

        vm.startBroadcast(deployerKey);
        address factoryImplementation = address(new SqueezLaunchFactory());
        SqueezCurveProxyDeployer curveProxyDeployer = new SqueezCurveProxyDeployer(deployer, curveBeacon);
        curveProxyDeployer.bindFactory(factory);
        vm.stopBroadcast();

        require(curveProxyDeployer.factory() == factory, "factory binding");
        require(curveProxyDeployer.beacon() == curveBeacon, "curve beacon");
        require(governance.code.length > 0, "governance missing");

        string memory object = "activation";
        vm.serializeString(object, "chain", "robinhood");
        vm.serializeString(object, "network", "mainnet");
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "factoryImplementation", factoryImplementation);
        string memory json = vm.serializeAddress(object, "curveProxyDeployer", address(curveProxyDeployer));
        vm.writeJson(
            json, string.concat(vm.projectRoot(), "/deployments/robinhood/mainnet-token-proxy-activation.json")
        );
    }
}
