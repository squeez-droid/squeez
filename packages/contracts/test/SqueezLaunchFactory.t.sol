// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {FeeDestination, FeeDestinationType, LaunchConfig, LaunchParams} from "../src/libraries/SqueezTypes.sol";
import {SqueezConstants} from "../src/libraries/SqueezConstants.sol";

contract SqueezLaunchFactoryTest is Test {
    address internal creator = makeAddr("creator");
    address internal feeRecipient = makeAddr("feeRecipient");
    address internal treasury = makeAddr("treasury");

    SqueezQuoteRegistry internal registry;
    SqueezLaunchFactory internal factory;

    function setUp() public {
        registry = new SqueezQuoteRegistry(address(this));
        factory = new SqueezLaunchFactory(address(this), registry, treasury, _config());
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
    }

    function test_LaunchRejectsExcessValueUntilOpeningBuyIsImplemented() public {
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.IncorrectLaunchValue.selector);
        factory.launch{value: 0.2 ether}(_params(200));
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

    function _params(uint16 creatorFeeBps) internal view returns (LaunchParams memory) {
        return LaunchParams({
            name: "Squeez Test",
            symbol: "SQT",
            metadataURI: "ipfs://bafy-test",
            quote: address(0),
            feeRecipient: feeRecipient,
            creatorFeeBps: creatorFeeBps,
            feeDestination: FeeDestination({kind: FeeDestinationType.Wallet, buybackBps: 0})
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
