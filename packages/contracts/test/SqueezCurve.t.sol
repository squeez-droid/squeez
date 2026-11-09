// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {LaunchConfig, FeeDestination, FeeDestinationType} from "../src/libraries/SqueezTypes.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezToken} from "../src/SqueezToken.sol";

contract SqueezCurveTest is Test {
    SqueezCurve curve;
    SqueezFeeVault vault;
    SqueezToken token;
    address buyer = makeAddr("buyer");

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
        vault = new SqueezFeeVault(address(this), makeAddr("treasury"));
        curve = new SqueezCurve(
            address(this), address(0), address(this), vault, 100, cfg, FeeDestination(FeeDestinationType.Wallet, 0)
        );
        token = new SqueezToken("Curve Test", "CURVE", "ipfs://curve", address(curve));
        curve.initialize(address(token));
        vault.registerCurve(address(token), address(curve));
        vm.deal(buyer, 100 ether);
    }

    function test_BuySettlesTokensReserveAndFees() public {
        vm.warp(curve.launchedAt() + 5);
        vm.roll(curve.launchedAtBlock() + 1);
        (uint256 expected, uint256 protocolFee, uint256 creatorFee,) = curve.quoteBuy(1 ether);

        vm.prank(buyer);
        uint256 received = curve.buy{value: 1 ether}(expected, block.timestamp);

        assertEq(received, expected);
        assertEq(token.balanceOf(buyer), expected);
        assertEq(curve.hypeRaised(), 1 ether - protocolFee - creatorFee);
        assertEq(vault.creatorFeesAccrued(address(token), address(0)), creatorFee);
        assertEq(vault.buybackBalance(address(0)), protocolFee * 80 / 100);
        assertEq(address(curve).balance, curve.hypeRaised());
    }

    function test_BuyThenSellMaintainsSolvency() public {
        vm.warp(curve.launchedAt() + 5);
        vm.roll(curve.launchedAtBlock() + 1);
        vm.prank(buyer);
        uint256 tokensOut = curve.buy{value: 1 ether}(0, block.timestamp);

        vm.startPrank(buyer);
        token.approve(address(curve), tokensOut);
        uint256 hypeOut = curve.sell(tokensOut, 0, block.timestamp);
        vm.stopPrank();

        assertGt(hypeOut, 0);
        assertEq(token.balanceOf(buyer), 0);
        assertEq(address(curve).balance, curve.hypeRaised() + curve.sniperTaxAccrued());
        assertLe(curve.hypeRaised(), 2);
    }

    function test_BuyRejectsExpiredDeadlineAndSlippage() public {
        vm.warp(curve.launchedAt() + 5);
        vm.roll(curve.launchedAtBlock() + 1);
        vm.prank(buyer);
        vm.expectRevert(SqueezCurve.Expired.selector);
        curve.buy{value: 1 ether}(0, block.timestamp - 1);

        vm.prank(buyer);
        vm.expectRevert(SqueezCurve.SlippageExceeded.selector);
        curve.buy{value: 1 ether}(type(uint256).max, block.timestamp);
    }

    function test_EarlyBuyEnforcesMaxWallet() public {
        vm.warp(curve.launchedAt() + 4);
        vm.roll(curve.launchedAtBlock() + 1);
        vm.prank(buyer);
        vm.expectRevert(SqueezCurve.MaxWalletExceeded.selector);
        curve.buy{value: 100 ether}(0, block.timestamp);
    }

    function test_NonCreatorCannotBuyInLaunchBlock() public {
        vm.prank(buyer);
        vm.expectRevert(SqueezCurve.Unauthorized.selector);
        curve.buy{value: 1 ether}(0, block.timestamp);
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
