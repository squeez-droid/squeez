// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";

interface IUniversalRouterLike {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IV4QuoterLike {
    struct QuoteExactSingleParams {
        PoolKey poolKey;
        bool zeroForOne;
        uint128 exactAmount;
        bytes hookData;
    }

    function quoteExactInputSingle(QuoteExactSingleParams memory params)
        external
        returns (uint256 amountOut, uint256 gasEstimate);
}

/// @notice Fork test: can the standard Uniswap Universal Router trade a graduated Squeez pool without any custom router?
/// Run against a Robinhood mainnet fork only:
///   SQUEEZ_FORK_TEST=1 forge test --match-contract SqueezUniversalRouterFork --fork-url $FORK_RPC -vv
/// Skipped in the default offline run.
contract SqueezUniversalRouterForkTest is Test {
    address constant CURVE = 0xAe42c954cdf3a9E9ECbBEe8041E2126cC37DB0f5;
    address constant TOKEN = 0x397d27E0678F6a0E51126CBCBF7F70475a2938EE;
    address constant HOOK = 0x27468dCA279b568a56C4EAF594Af94B887Aca0CC;
    address constant VAULT = 0xDd3d50eb4d35ba86Ca94fd5c0A2333e2632d7551;
    address constant PERMIT2 = 0x000000000022D473030F116dDEE9F6B43aC78BA3;
    uint8 constant V4_SWAP = 0x10;

    address user = makeAddr("trader");

    function setUp() public {
        if (!vm.envOr("SQUEEZ_FORK_TEST", false)) vm.skip(true);
    }

    function test_StandardUniversalRouterTradesGraduatedSqueezPool() public {
        address universalRouter = vm.envAddress("UNIVERSAL_ROUTER");
        address quoter = vm.envAddress("V4_QUOTER_ADDRESS");
        SqueezCurve curve = SqueezCurve(payable(CURVE));

        // 1. Graduate the live token on the fork with a closing buy and the permissionless graduate().
        vm.deal(user, 100 ether);
        vm.warp(block.timestamp + 1 days);
        vm.roll(block.number + 10);
        vm.prank(user);
        curve.buy{value: 10 ether}(0, block.timestamp + 1 hours);
        assertTrue(curve.graduated(), "closing buy did not graduate the curve");
        curve.graduate();
        assertEq(curve.graduationState(), 2, "graduation did not complete");

        PoolKey memory key = PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(TOKEN),
            fee: 0,
            tickSpacing: 60,
            hooks: IHooks(HOOK)
        });
        uint128 amountIn = 0.05 ether;

        // 2. Quote with the canonical v4 Quoter, then buy through the Universal Router.
        (uint256 quotedOut,) = IV4QuoterLike(quoter).quoteExactInputSingle(
            IV4QuoterLike.QuoteExactSingleParams({poolKey: key, zeroForOne: true, exactAmount: amountIn, hookData: ""})
        );
        assertGt(quotedOut, 0, "quoter returned zero");

        uint256 tokensBefore = IERC20(TOKEN).balanceOf(user);
        uint256 creatorFeesBefore = SqueezFeeVault(payable(VAULT)).creatorFeesAccrued(TOKEN, address(0));
        vm.prank(user);
        _swap(universalRouter, key, true, amountIn, uint128(quotedOut), key.currency0, key.currency1, amountIn);
        uint256 bought = IERC20(TOKEN).balanceOf(user) - tokensBefore;
        assertEq(bought, quotedOut, "executed output differs from the quoter");
        assertGt(
            SqueezFeeVault(payable(VAULT)).creatorFeesAccrued(TOKEN, address(0)), creatorFeesBefore,
            "hook did not collect the creator fee"
        );

        // 3. Sell back through the Universal Router (token side needs Permit2 approvals).
        vm.startPrank(user);
        IERC20(TOKEN).approve(PERMIT2, type(uint256).max);
        IAllowanceTransfer(PERMIT2).approve(TOKEN, universalRouter, uint160(bought), uint48(block.timestamp + 1 hours));
        uint256 ethBefore = user.balance;
        _swap(universalRouter, key, false, uint128(bought), 1, key.currency1, key.currency0, 0);
        vm.stopPrank();
        assertGt(user.balance, ethBefore, "sell returned no native currency");
        assertEq(IERC20(TOKEN).balanceOf(user), tokensBefore, "sell did not consume the bought tokens");
    }

    function _swap(
        address universalRouter,
        PoolKey memory key,
        bool zeroForOne,
        uint128 amountIn,
        uint128 minOut,
        Currency input,
        Currency output,
        uint256 value
    ) private {
        bytes memory actions =
            abi.encodePacked(uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key, zeroForOne: zeroForOne, amountIn: amountIn, amountOutMinimum: minOut, hookData: ""
            })
        );
        params[1] = abi.encode(input, uint256(amountIn));
        params[2] = abi.encode(output, uint256(minOut));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);
        IUniversalRouterLike(universalRouter).execute{value: value}(abi.encodePacked(V4_SWAP), inputs, block.timestamp + 1 hours);
    }
}
