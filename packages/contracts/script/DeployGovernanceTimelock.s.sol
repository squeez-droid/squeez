// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

contract DeployGovernanceTimelock is Script {
    function run() external returns (TimelockController timelock) {
        address safe = vm.envAddress("ADMIN_MULTISIG");
        require(safe.code.length > 0, "admin must be deployed Safe");
        uint256 delay = vm.envUint("GOVERNANCE_TIMELOCK_DELAY_SECONDS");
        require(delay == 300, "production delay must be 300 seconds");

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address[] memory safeOnly = new address[](1);
        safeOnly[0] = safe;

        vm.startBroadcast(deployerKey);
        timelock = new TimelockController(delay, safeOnly, safeOnly, safe);
        vm.stopBroadcast();

        require(timelock.getMinDelay() == delay, "delay mismatch");
        require(timelock.hasRole(timelock.PROPOSER_ROLE(), safe), "Safe is not proposer");
        require(timelock.hasRole(timelock.EXECUTOR_ROLE(), safe), "Safe is not executor");
        require(timelock.hasRole(timelock.CANCELLER_ROLE(), safe), "Safe is not canceller");
        require(timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), safe), "Safe is not admin");
        require(!timelock.hasRole(timelock.PROPOSER_ROLE(), deployer), "deployer is proposer");
        require(!timelock.hasRole(timelock.EXECUTOR_ROLE(), deployer), "deployer is executor");
        require(!timelock.hasRole(timelock.DEFAULT_ADMIN_ROLE(), deployer), "deployer is admin");
    }
}
