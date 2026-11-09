// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";

contract MockFeeCurve {
    address public feeRecipient;
    address public immutable factory;
    address public immutable token;

    constructor(address recipient, address factory_, address token_) {
        feeRecipient = recipient;
        factory = factory_;
        token = token_;
    }

    function setFeeRecipient(address recipient) external {
        feeRecipient = recipient;
    }

    function deposit(SqueezFeeVault vault, address tokenAddress, uint256 protocolFee, uint256 creatorFee)
        external
        payable
    {
        vault.depositFees{value: msg.value}(tokenAddress, address(0), protocolFee, creatorFee);
    }
}

contract ReentrantFeeRecipient {
    SqueezFeeVault public immutable vault;
    address public immutable token;
    bool public reentrySucceeded;

    constructor(SqueezFeeVault vault_, address token_) {
        vault = vault_;
        token = token_;
    }

    function claim() external {
        vault.claimCreatorFees(token, address(0));
    }

    receive() external payable {
        (reentrySucceeded,) = address(vault).call(abi.encodeCall(SqueezFeeVault.claimCreatorFees, (token, address(0))));
    }
}

contract SqueezFeeVaultTest is Test {
    SqueezFeeVault internal vault;
    MockFeeCurve internal curve;
    address internal token = makeAddr("token");
    address internal creatorRecipient = makeAddr("creatorRecipient");
    address internal treasury = makeAddr("treasury");

    function setUp() public {
        vault = new SqueezFeeVault(address(this), treasury);
        curve = new MockFeeCurve(creatorRecipient, address(this), token);
        vault.registerCurve(token, address(curve));
    }

    function test_DepositSplitsProtocolAndTracksCreatorLiability() public {
        curve.deposit{value: 3 ether}(vault, token, 1 ether, 2 ether);

        assertEq(vault.buybackBalance(address(0)), 0.8 ether);
        assertEq(vault.treasuryBalance(address(0)), 0.2 ether);
        assertEq(vault.creatorFeesAccrued(token, address(0)), 2 ether);
        assertEq(address(vault).balance, 3 ether);
    }

    function test_OnlyRegisteredCurveCanDeposit() public {
        vm.expectRevert(SqueezFeeVault.Unauthorized.selector);
        vault.depositFees{value: 1 ether}(token, address(0), 1 ether, 0);
    }

    function test_DepositRequiresExactNativeValue() public {
        vm.expectRevert(SqueezFeeVault.InvalidDeposit.selector);
        curve.deposit{value: 2 ether}(vault, token, 1 ether, 2 ether);
    }

    function test_CurrentFeeRecipientCanClaimAfterRecipientUpdate() public {
        curve.deposit{value: 2 ether}(vault, token, 0, 2 ether);
        address nextRecipient = makeAddr("nextRecipient");
        curve.setFeeRecipient(nextRecipient);

        vm.prank(creatorRecipient);
        vm.expectRevert(SqueezFeeVault.Unauthorized.selector);
        vault.claimCreatorFees(token, address(0));

        vm.prank(nextRecipient);
        uint256 claimed = vault.claimCreatorFees(token, address(0));
        assertEq(claimed, 2 ether);
        assertEq(nextRecipient.balance, 2 ether);
        assertEq(vault.creatorFeesAccrued(token, address(0)), 0);
    }

    function test_TreasuryWithdrawalCannotConsumeCreatorLiability() public {
        curve.deposit{value: 3 ether}(vault, token, 1 ether, 2 ether);

        vm.prank(treasury);
        uint256 withdrawn = vault.withdrawTreasury(address(0));
        assertEq(withdrawn, 0.2 ether);
        assertEq(address(vault).balance, 2.8 ether);
        assertEq(vault.creatorFeesAccrued(token, address(0)), 2 ether);
        assertEq(vault.buybackBalance(address(0)), 0.8 ether);
    }

    function test_MaliciousRecipientCannotReenterCreatorClaim() public {
        ReentrantFeeRecipient recipient = new ReentrantFeeRecipient(vault, token);
        curve.setFeeRecipient(address(recipient));
        curve.deposit{value: 2 ether}(vault, token, 0, 2 ether);

        recipient.claim();

        assertEq(address(recipient).balance, 2 ether);
        assertFalse(recipient.reentrySucceeded());
        assertEq(vault.creatorFeesAccrued(token, address(0)), 0);
    }

    function test_RegistrationCannotBeOverwritten() public {
        vm.expectRevert(SqueezFeeVault.InvalidRegistration.selector);
        vault.registerCurve(token, makeAddr("replacementCurve"));
    }

    function test_RegistrationRequiresCurveFactoryIdentity() public {
        address secondToken = makeAddr("secondToken");
        MockFeeCurve foreignCurve = new MockFeeCurve(creatorRecipient, makeAddr("foreignFactory"), secondToken);
        vm.expectRevert(SqueezFeeVault.Unauthorized.selector);
        vault.registerCurve(secondToken, address(foreignCurve));
    }
}
