// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";

/// @notice Deploys a new Curve implementation WITHOUT touching the beacon. The beacon is owned by the governance
/// timelock, so the upgrade itself is scheduled and executed by the Safe (see
/// scripts/generate-curve-upgrade-governance-batches.mjs).
contract DeployCurveImplementation is Script {
    function run() external {
        uint256 signerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (signerKey == 0) signerKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        vm.startBroadcast(signerKey);
        address implementation = address(new SqueezCurve());
        vm.stopBroadcast();

        require(implementation.code.length > 0, "implementation has no code");
        string memory object = "curveImplementation";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "deployer", vm.addr(signerKey));
        string memory json = vm.serializeAddress(object, "curveImplementation", implementation);
        vm.writeJson(
            json,
            string.concat(
                vm.projectRoot(), "/deployments/", vm.envString("SQUEEZ_NETWORK"), "-curve-implementation.json"
            )
        );
    }
}
