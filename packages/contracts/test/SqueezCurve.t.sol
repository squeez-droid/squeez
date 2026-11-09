// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {LaunchConfig, FeeDestination, FeeDestinationType} from "../src/libraries/SqueezTypes.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {ProxyTestBase} from "./ProxyTestBase.sol";

contract RejectingRefundBuyer {
    function closeCurve(SqueezCurve curve, uint256 value) external payable {
        curve.buy{value: value}(0, block.timestamp);
    }

    receive() external payable {
        revert("reject refund");
    }
}

contract SqueezCurveTest is Test, ProxyTestBase {
    SqueezCurve curve;
    SqueezFeeVault vault;
    SqueezToken token;
    address buyer = makeAddr("buyer");

    function setUp() public {
        (curve, vault, token) = _deployCurve(100);
        vm.deal(buyer, 100 ether);
    }

    function _config() private pure returns (LaunchConfig memory) {
        return LaunchConfig({
            graduationThresholdHype: 400 ether,
            virtualHypeReserve: 160 ether,
            virtualTokenReserve: 1_000_000_000 ether,
            sniperTaxStartBps: 9_900,
            sniperTaxDecaySeconds: 5,
            maxWalletBps: 500,
            maxWalletWindowSeconds: 300,
            launchFeeHype: 0.5 ether
        });
    }

    function _deployCurve(uint16 creatorFeeBps)
        private
        returns (SqueezCurve deployedCurve, SqueezFeeVault deployedVault, SqueezToken deployedToken)
    {
        deployedVault = _deployVault(address(this), makeAddr(string.concat("treasury", vm.toString(creatorFeeBps))));
        UpgradeableBeacon beacon = _deployCurveBeacon(address(this));
        deployedCurve = SqueezCurve(
            payable(address(
                    new BeaconProxy(
                        address(beacon),
                        abi.encodeCall(
                            SqueezCurve.initializeCurve,
                            (
                                address(this),
                                address(this),
                                address(0),
                                address(this),
                                deployedVault,
                                creatorFeeBps,
                                _config(),
                                FeeDestination(FeeDestinationType.Wallet, 0)
                            )
                        )
                    )
                ))
        );
        deployedToken = new SqueezToken("Curve Test", "CURVE", "ipfs://curve", address(deployedCurve));
        deployedCurve.initializeToken(address(deployedToken));
        deployedVault.registerCurve(address(deployedToken), address(deployedCurve));
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

    function test_CreatorFeeSettlementAtZeroTwoAndTenPercent() public {
        uint16[3] memory feeBps = [uint16(0), uint16(200), uint16(1_000)];
        for (uint256 i; i < feeBps.length; ++i) {
            (SqueezCurve feeCurve, SqueezFeeVault feeVault, SqueezToken feeToken) = _deployCurve(feeBps[i]);
            vm.warp(feeCurve.launchedAt() + 5);
            vm.roll(feeCurve.launchedAtBlock() + 1);

            (uint256 tokensOut, uint256 protocolFee, uint256 creatorFee,) = feeCurve.quoteBuy(1 ether);
            vm.prank(buyer);
            feeCurve.buy{value: 1 ether}(tokensOut, block.timestamp);

            assertEq(protocolFee, 0.01 ether);
            assertEq(creatorFee, (1 ether * uint256(feeBps[i])) / 10_000);
            assertEq(feeVault.creatorFeesAccrued(address(feeToken), address(0)), creatorFee);
            assertEq(feeVault.buybackBalance(address(0)), 0.008 ether);
            assertEq(feeVault.treasuryBalance(address(0)), 0.002 ether);
            assertEq(feeCurve.hypeRaised(), 1 ether - protocolFee - creatorFee);
            assertEq(address(feeCurve).balance, feeCurve.hypeRaised());
        }
    }

    function test_ClosingBuyCapsAtExactThresholdAndRefundsOvershoot() public {
        vm.warp(curve.launchedAt() + 301);
        vm.roll(curve.launchedAtBlock() + 1);
        vm.deal(buyer, 1_000 ether);

        (uint256 expectedTokens, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax) =
            curve.quoteBuy(1_000 ether);
        uint256 threshold = _config().graduationThresholdHype;
        uint256 acceptedGross = threshold + protocolFee + creatorFee + sniperTax;
        uint256 balanceBefore = buyer.balance;

        vm.prank(buyer);
        uint256 received = curve.buy{value: acceptedGross + 1 ether}(expectedTokens, block.timestamp);

        assertEq(received, expectedTokens);
        assertEq(balanceBefore - buyer.balance, acceptedGross);
        assertEq(curve.hypeRaised(), threshold);
        assertTrue(curve.graduated());
        assertEq(address(curve).balance, curve.hypeRaised() + curve.sniperTaxAccrued());
    }

    function test_ExactThresholdClosesWithoutRefund() public {
        vm.warp(curve.launchedAt() + 301);
        vm.roll(curve.launchedAtBlock() + 1);
        vm.deal(buyer, 1_000 ether);
        (uint256 expectedTokens, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax) =
            curve.quoteBuy(1_000 ether);
        uint256 threshold = _config().graduationThresholdHype;
        uint256 acceptedGross = threshold + protocolFee + creatorFee + sniperTax;

        vm.prank(buyer);
        curve.buy{value: acceptedGross}(expectedTokens, block.timestamp);

        assertEq(curve.hypeRaised(), threshold);
        assertTrue(curve.graduated());
    }

    function test_ClosingBuyRevertsAtomicallyWhenRefundIsRejected() public {
        vm.warp(curve.launchedAt() + 301);
        vm.roll(curve.launchedAtBlock() + 1);
        RejectingRefundBuyer rejectingBuyer = new RejectingRefundBuyer();
        vm.deal(address(rejectingBuyer), 1_000 ether);

        (, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax) = curve.quoteBuy(1_000 ether);
        uint256 acceptedGross = _config().graduationThresholdHype + protocolFee + creatorFee + sniperTax;
        vm.expectRevert(SqueezCurve.TransferFailed.selector);
        rejectingBuyer.closeCurve{value: acceptedGross + 1}(curve, acceptedGross + 1);

        assertEq(curve.hypeRaised(), 0);
        assertFalse(curve.graduated());
        assertEq(token.balanceOf(address(rejectingBuyer)), 0);
        assertEq(vault.buybackBalance(address(0)), 0);
    }

    function test_ClosedCurveRejectsFurtherBuyAndSell() public {
        vm.warp(curve.launchedAt() + 301);
        vm.roll(curve.launchedAtBlock() + 1);
        vm.deal(buyer, 1_000 ether);
        (uint256 expectedTokens, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax) =
            curve.quoteBuy(1_000 ether);
        uint256 acceptedGross = _config().graduationThresholdHype + protocolFee + creatorFee + sniperTax;
        vm.startPrank(buyer);
        uint256 bought = curve.buy{value: acceptedGross}(expectedTokens, block.timestamp);

        vm.expectRevert(SqueezCurve.CurveClosed.selector);
        curve.buy{value: 1}(0, block.timestamp);
        token.approve(address(curve), bought);
        vm.expectRevert(SqueezCurve.CurveClosed.selector);
        curve.sell(bought, 0, block.timestamp);
        vm.stopPrank();
    }

    // TODO (brief): curve math, protocol 1% + creator fee 0–10%, graduation per pair type, holders distribution.
}
