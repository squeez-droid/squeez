// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {LaunchConfig, FeeDestination, FeeDestinationType} from "../src/libraries/SqueezTypes.sol";

contract SqueezCurveTest is Test {
    SqueezCurve curve;

    function setUp() public {
        LaunchConfig memory cfg = LaunchConfig({
            graduationThresholdHype: 400 ether,
            virtualHypeReserve: 160 ether,
            virtualTokenReserve: 1_000_000_000 ether,
            sniperTaxStartBps: 9_900,
            sniperTaxDecaySeconds: 5,
            maxWalletBps: 500,
            maxWalletWindowSeconds: 300,
            launchFeeHype: 0.5 ether
        });
        curve = new SqueezCurve(
            address(this), address(0), address(this), 100, cfg, FeeDestination(FeeDestinationType.Wallet, 0)
        );
    }

    function test_SniperTaxDecaysLinearly() public {
        assertEq(curve.sniperTaxBps(), 9_900);
        uint256 launchedAt = block.timestamp;
        vm.warp(launchedAt + 1);
        assertEq(curve.sniperTaxBps(), 7_920);
        vm.warp(launchedAt + 5);
        assertEq(curve.sniperTaxBps(), 0);
    }

    // TODO (brief): curve math, protocol 1% + creator fee 0–10%, graduation per pair type, holders distribution.
}
