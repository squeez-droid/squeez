// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {ISqueezGraduationAdapter} from "../src/interfaces/ISqueezGraduationAdapter.sol";
import {LaunchConfig, FeeDestination, FeeDestinationType} from "../src/libraries/SqueezTypes.sol";
import {ProxyTestBase} from "./ProxyTestBase.sol";

contract GraduationFactoryStub {
    address public graduationAdapter;

    function setAdapter(address adapter) external {
        graduationAdapter = adapter;
    }
}

contract GraduationAdapterMock is ISqueezGraduationAdapter {
    bool public shouldFail;
    bool public malformedResult;
    uint256 public calls;
    address public immutable pool = address(0xBEEF);

    function configure(bool fail_, bool malformed_) external {
        shouldFail = fail_;
        malformedResult = malformed_;
    }

    function graduate(address token, address, uint256 quoteAmount, uint256 tokenAmount)
        external
        payable
        returns (address, uint256, uint256)
    {
        if (shouldFail) revert("adapter failure");
        require(msg.value == quoteAmount, "quote mismatch");
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);
        calls++;
        if (malformedResult) return (address(0), quoteAmount, tokenAmount);
        return (pool, quoteAmount, tokenAmount);
    }
}

contract SqueezGraduationTest is Test, ProxyTestBase {
    SqueezCurve internal curve;
    SqueezToken internal token;
    GraduationFactoryStub internal factory;
    GraduationAdapterMock internal adapter;
    address internal buyer = makeAddr("graduationBuyer");

    function setUp() public {
        factory = new GraduationFactoryStub();
        adapter = new GraduationAdapterMock();
        factory.setAdapter(address(adapter));
        SqueezFeeVault vault = _deployVault(address(this), makeAddr("graduationTreasury"));
        UpgradeableBeacon beacon = _deployCurveBeacon(address(this));
        LaunchConfig memory config = LaunchConfig({
            graduationThresholdHype: 4 ether,
            virtualHypeReserve: 1.6 ether,
            virtualTokenReserve: 1_000_000_000 ether,
            sniperTaxStartBps: 0,
            sniperTaxDecaySeconds: 0,
            maxWalletBps: 0,
            maxWalletWindowSeconds: 0,
            launchFeeHype: 0
        });
        curve = SqueezCurve(
            payable(address(
                    new BeaconProxy(
                        address(beacon),
                        abi.encodeCall(
                            SqueezCurve.initializeCurve,
                            (
                                address(factory),
                                address(this),
                                address(0),
                                address(this),
                                vault,
                                0,
                                config,
                                FeeDestination(FeeDestinationType.Wallet, 0)
                            )
                        )
                    )
                ))
        );
        token = new SqueezToken("Graduation", "GRAD", "ipfs://graduation", address(curve));
        vm.prank(address(factory));
        curve.initializeToken(address(token));
        vm.prank(address(factory));
        vault.registerCurve(address(token), address(curve));
        vm.deal(buyer, 10 ether);
        vm.roll(curve.launchedAtBlock() + 1);
    }

    function test_GraduationRequiresThresholdAndConfiguredAdapter() public {
        vm.expectRevert(SqueezCurve.ThresholdNotReached.selector);
        curve.graduate();

        _closeCurve();
        factory.setAdapter(address(0));
        vm.expectRevert(SqueezCurve.GraduationUnavailable.selector);
        curve.graduate();
        assertEq(curve.graduationState(), 0);
    }

    function test_GraduationIsPermissionlessAtomicAndIdempotent() public {
        _closeCurve();
        uint256 quoteAmount = curve.hypeRaised();
        uint256 tokenAmount = token.balanceOf(address(curve));

        vm.prank(makeAddr("keeper"));
        curve.graduate();

        assertEq(curve.graduationState(), 2);
        assertEq(curve.graduationPool(), adapter.pool());
        assertEq(curve.hypeRaised(), 0);
        assertEq(address(adapter).balance, quoteAmount);
        assertEq(token.balanceOf(address(adapter)), tokenAmount);
        assertEq(token.allowance(address(curve), address(adapter)), 0);
        assertEq(adapter.calls(), 1);

        curve.graduate();
        assertEq(adapter.calls(), 1);
    }

    function test_FailedOrMalformedGraduationCanBeRetried() public {
        _closeCurve();
        uint256 quoteBefore = curve.hypeRaised();
        uint256 tokenBefore = token.balanceOf(address(curve));

        adapter.configure(true, false);
        vm.expectRevert("adapter failure");
        curve.graduate();
        _assertPendingBalances(quoteBefore, tokenBefore);

        adapter.configure(false, true);
        vm.expectRevert(SqueezCurve.InvalidGraduationResult.selector);
        curve.graduate();
        _assertPendingBalances(quoteBefore, tokenBefore);

        adapter.configure(false, false);
        curve.graduate();
        assertEq(curve.graduationState(), 2);
        assertEq(adapter.calls(), 1);
    }

    function _closeCurve() private {
        vm.prank(buyer);
        curve.buy{value: 5 ether}(0, block.timestamp);
        assertTrue(curve.graduated());
    }

    function _assertPendingBalances(uint256 quoteAmount, uint256 tokenAmount) private view {
        assertEq(curve.graduationState(), 0);
        assertEq(curve.hypeRaised(), quoteAmount);
        assertEq(address(curve).balance, quoteAmount);
        assertEq(token.balanceOf(address(curve)), tokenAmount);
        assertEq(token.allowance(address(curve), address(adapter)), 0);
    }
}
