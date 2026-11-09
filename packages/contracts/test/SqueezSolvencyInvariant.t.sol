// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {LaunchConfig, FeeDestination, FeeDestinationType} from "../src/libraries/SqueezTypes.sol";
import {ProxyTestBase} from "./ProxyTestBase.sol";

contract SolvencyHandler is Test {
    SqueezCurve public immutable curve;
    SqueezFeeVault public immutable vault;
    SqueezToken public immutable token;

    constructor(SqueezCurve curve_, SqueezFeeVault vault_, SqueezToken token_) {
        curve = curve_;
        vault = vault_;
        token = token_;
        token_.approve(address(curve_), type(uint256).max);
    }

    receive() external payable {}

    function buy(uint96 seed) external {
        if (curve.graduated()) return;
        uint256 amount = bound(uint256(seed), 1 gwei, 25 ether);
        if (address(this).balance < amount) return;
        try curve.buy{value: amount}(0, block.timestamp) {} catch {}
    }

    function sell(uint96 seed) external {
        if (curve.graduated()) return;
        uint256 balance = token.balanceOf(address(this));
        if (balance == 0) return;
        uint256 amount = bound(uint256(seed), 1, balance);
        try curve.sell(amount, 0, block.timestamp) {} catch {}
    }

    function claimCreatorFees() external {
        if (vault.creatorFeesAccrued(address(token), address(0)) == 0) return;
        try vault.claimCreatorFees(address(token), address(0)) {} catch {}
    }

    function withdrawBuyback(uint96 seed) external {
        uint256 available = vault.buybackBalance(address(0));
        uint256 cap = vault.buybackWithdrawalCap(address(0));
        uint256 maximum = available < cap ? available : cap;
        if (maximum == 0) return;
        uint256 amount = bound(uint256(seed), 1, maximum);
        try vault.withdrawBuyback(address(0), address(this), amount) {} catch {}
    }
}

contract SqueezSolvencyInvariant is StdInvariant, Test, ProxyTestBase {
    SqueezCurve internal curve;
    SqueezFeeVault internal vault;
    SqueezToken internal token;
    SolvencyHandler internal handler;
    address internal treasury = makeAddr("invariantTreasury");

    function setUp() public {
        LaunchConfig memory config = LaunchConfig({
            graduationThresholdHype: 400 ether,
            virtualHypeReserve: 160 ether,
            virtualTokenReserve: 1_000_000_000 ether,
            sniperTaxStartBps: 9_900,
            sniperTaxDecaySeconds: 5,
            maxWalletBps: 500,
            maxWalletWindowSeconds: 300,
            launchFeeHype: 0.1 ether
        });
        vault = _deployVault(address(this), treasury);
        UpgradeableBeacon beacon = _deployCurveBeacon(address(this));
        curve = SqueezCurve(
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
                                vault,
                                200,
                                config,
                                FeeDestination(FeeDestinationType.Wallet, 0)
                            )
                        )
                    )
                ))
        );
        token = new SqueezToken("Invariant", "INV", "ipfs://invariant", address(curve));
        curve.initializeToken(address(token));
        vault.registerCurve(address(token), address(curve));
        handler = new SolvencyHandler(curve, vault, token);
        curve.setFeeRecipient(address(handler));
        vault.setBuybackOperator(address(handler));
        vault.setBuybackWithdrawalCap(address(0), 1 ether);
        vm.deal(address(handler), 2_000 ether);
        vm.warp(curve.launchedAt() + 301);
        vm.roll(curve.launchedAtBlock() + 1);
        bytes4[] memory selectors = new bytes4[](4);
        selectors[0] = handler.buy.selector;
        selectors[1] = handler.sell.selector;
        selectors[2] = handler.claimCreatorFees.selector;
        selectors[3] = handler.withdrawBuyback.selector;
        targetContract(address(handler));
        targetSelector(FuzzSelector({addr: address(handler), selectors: selectors}));
    }

    function invariant_CurveNativeBalanceCoversAllCurveLiabilities() public view {
        assertEq(address(curve).balance, curve.hypeRaised() + curve.sniperTaxAccrued());
        (uint256 threshold,,,,,,,) = curve.config();
        assertLe(curve.hypeRaised(), threshold);
    }

    function invariant_VaultNativeBalanceEqualsAccountedBuckets() public view {
        uint256 accounted = vault.creatorFeesAccrued(address(token), address(0)) + vault.buybackBalance(address(0))
            + vault.treasuryBalance(address(0));
        assertEq(address(vault).balance, accounted);
    }

    function invariant_TokenSupplyIsConserved() public view {
        assertEq(token.balanceOf(address(curve)) + token.balanceOf(address(handler)), token.totalSupply());
    }
}
