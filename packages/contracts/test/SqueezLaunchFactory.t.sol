// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {FeeDestination, FeeDestinationType, LaunchConfig, LaunchParams} from "../src/libraries/SqueezTypes.sol";
import {SqueezConstants} from "../src/libraries/SqueezConstants.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {ProxyTestBase} from "./ProxyTestBase.sol";

contract RejectingTreasury {
    receive() external payable {
        revert("reject");
    }
}

contract GraduationAdapterStub {}

contract SqueezLaunchFactoryTest is Test, ProxyTestBase {
    address internal creator = makeAddr("creator");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal treasury = makeAddr("treasury");

    SqueezQuoteRegistry internal registry;
    SqueezLaunchFactory internal factory;
    SqueezFeeVault internal feeVault;
    UpgradeableBeacon internal curveBeacon;

    function setUp() public {
        registry = _deployRegistry(address(this));
        feeVault = _deployVault(address(this), treasury);
        curveBeacon = _deployCurveBeacon(address(this));
        factory = _deployFactory(address(this), registry, feeVault, treasury, address(curveBeacon), _config());
        vm.deal(creator, 10 ether);
    }

    function test_LaunchForwardsFeeAndPersistsConfiguration() public {
        uint256 treasuryBefore = treasury.balance;
        vm.prank(creator);
        (address token, address curveAddress) = factory.launch{value: 0.1 ether}(_params(200));

        SqueezCurve curve = SqueezCurve(curveAddress);
        assertEq(treasury.balance - treasuryBefore, 0.1 ether);
        assertEq(curve.creator(), creator);
        assertEq(curve.feeRecipient(), feeRecipient);
        assertEq(curve.creatorFeeBps(), 200);
        assertEq(curve.token(), token);
        assertEq(SqueezToken(token).balanceOf(curveAddress), SqueezConstants.TOTAL_SUPPLY);
        assertEq(feeVault.curveForToken(token), curveAddress);
    }

    function test_LaunchRejectsValueAboveRequiredLaunchAndOpeningBuy() public {
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.IncorrectLaunchValue.selector);
        factory.launch{value: 0.2 ether}(_params(200));
    }

    function test_LaunchRejectsInsufficientValue() public {
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InsufficientLaunchFee.selector);
        factory.launch{value: 0.09 ether}(_params(200));
    }

    function test_LaunchRejectsInactiveQuote() public {
        LaunchParams memory params = _params(200);
        params.quote = makeAddr("inactiveQuote");

        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.QuoteNotActive.selector);
        factory.launch{value: 0.1 ether}(params);
    }

    function test_LaunchRevertsAtomicallyWhenTreasuryRejectsFee() public {
        RejectingTreasury rejectingTreasury = new RejectingTreasury();
        SqueezFeeVault rejectingVault = _deployVault(address(this), address(rejectingTreasury));
        SqueezLaunchFactory rejectingFactory = _deployFactory(
            address(this), registry, rejectingVault, address(rejectingTreasury), address(curveBeacon), _config()
        );

        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.TreasuryTransferFailed.selector);
        rejectingFactory.launch{value: 0.1 ether}(_params(200));
        assertEq(address(rejectingTreasury).balance, 0);
    }

    function test_LaunchExecutesAtomicOpeningBuyForCreator() public {
        LaunchParams memory params = _params(200);
        params.openingBuyHype = 0.5 ether;

        vm.prank(creator);
        (address token, address curveAddress) = factory.launch{value: 0.6 ether}(params);

        assertGt(SqueezToken(token).balanceOf(creator), 0);
        assertGt(SqueezCurve(curveAddress).hypeRaised(), 0);
        assertEq(treasury.balance, 0.1 ether);
        assertGt(feeVault.creatorFeesAccrued(token, address(0)), 0);
    }

    function test_OpeningBuySlippageRevertsEntireLaunch() public {
        LaunchParams memory params = _params(200);
        params.openingBuyHype = 0.1 ether;
        params.openingBuyMinTokens = type(uint256).max;

        vm.prank(creator);
        vm.expectRevert(SqueezCurve.SlippageExceeded.selector);
        factory.launch{value: 0.2 ether}(params);
        assertEq(treasury.balance, 0);
    }

    function test_LaunchRejectsCreatorFeeAboveMaximum() public {
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidCreatorFee.selector);
        factory.launch{value: 0.1 ether}(_params(1_001));
    }

    function test_CreatorCanUpdateFeeRecipient() public {
        vm.prank(creator);
        (, address curveAddress) = factory.launch{value: 0.1 ether}(_params(200));

        address nextRecipient = makeAddr("nextRecipient");
        vm.prank(creator);
        SqueezCurve(curveAddress).setFeeRecipient(nextRecipient);
        assertEq(SqueezCurve(curveAddress).feeRecipient(), nextRecipient);
    }

    function test_NonCreatorCannotUpdateFeeRecipient() public {
        vm.prank(creator);
        (, address curveAddress) = factory.launch{value: 0.1 ether}(_params(200));

        vm.expectRevert(SqueezCurve.Unauthorized.selector);
        SqueezCurve(curveAddress).setFeeRecipient(makeAddr("attackerRecipient"));
    }

    function test_SetLaunchConfigRejectsInvalidReserves() public {
        LaunchConfig memory invalid = _config();
        invalid.virtualHypeReserve = 0;
        vm.expectRevert(SqueezLaunchFactory.InvalidLaunchConfig.selector);
        factory.setLaunchConfig(invalid);
    }

    function test_OnlyOwnerCanSetOrPauseGraduationAdapter() public {
        GraduationAdapterStub adapter = new GraduationAdapterStub();
        factory.setGraduationAdapter(address(adapter));
        assertEq(factory.graduationAdapter(), address(adapter));

        vm.prank(creator);
        vm.expectRevert();
        factory.setGraduationAdapter(address(adapter));

        vm.expectRevert(SqueezLaunchFactory.InvalidAdapter.selector);
        factory.setGraduationAdapter(makeAddr("notContract"));

        factory.setGraduationAdapter(address(0));
        assertEq(factory.graduationAdapter(), address(0));
    }

    function test_LaunchRejectsInvalidMetadataFields() public {
        LaunchParams memory params = _params(200);
        params.name = "";
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidName.selector);
        factory.launch{value: 0.1 ether}(params);

        params = _params(200);
        params.symbol = "SYMBOL-IS-TOO-LONG";
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidSymbol.selector);
        factory.launch{value: 0.1 ether}(params);

        params = _params(200);
        params.metadataURI = "https://example.com/metadata.json";
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidMetadataURI.selector);
        factory.launch{value: 0.1 ether}(params);
    }

    function test_OpeningBuyQuoteMatchesAtomicLaunch() public {
        (uint256 expected,,,) = factory.quoteOpeningBuy(0.5 ether, 200);
        LaunchParams memory params = _params(200);
        params.openingBuyHype = 0.5 ether;
        params.openingBuyMinTokens = expected;

        vm.prank(creator);
        (address token,) = factory.launch{value: 0.6 ether}(params);
        assertEq(SqueezToken(token).balanceOf(creator), expected);
    }

    function _params(uint16 creatorFeeBps) internal view returns (LaunchParams memory) {
        return LaunchParams({
            name: "Squeez Test",
            symbol: "SQT",
            metadataURI: "ipfs://bafy-test",
            quote: address(0),
            feeRecipient: feeRecipient,
            creatorFeeBps: creatorFeeBps,
            feeDestination: FeeDestination({kind: FeeDestinationType.Wallet, buybackBps: 0}),
            openingBuyHype: 0,
            openingBuyMinTokens: 0
        });
    }

    function _config() internal pure returns (LaunchConfig memory) {
        return LaunchConfig({
            graduationThresholdHype: 1 ether,
            virtualHypeReserve: 0.4 ether,
            virtualTokenReserve: 1_000_000_000 ether,
            sniperTaxStartBps: 9_900,
            sniperTaxDecaySeconds: 5,
            maxWalletBps: 500,
            maxWalletWindowSeconds: 300,
            launchFeeHype: 0.1 ether
        });
    }
}
