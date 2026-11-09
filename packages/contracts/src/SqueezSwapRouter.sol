// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IUnlockCallback} from "@uniswap/v4-core/src/interfaces/callback/IUnlockCallback.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";

/// @notice Minimal exact-input router for Squeez v4 pools.
contract SqueezSwapRouter is IUnlockCallback {
    using SafeERC20 for IERC20;

    error Unauthorized();
    error InvalidPool();
    error InvalidAmount();
    error Expired();
    error SlippageExceeded();
    error TransferFailed();

    event PoolSwap(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 quoteAmount,
        uint256 tokenAmount
    );

    IPoolManager public immutable poolManager;
    IHooks public immutable hook;
    bool private swapping;

    struct CallbackData {
        address payer;
        address recipient;
        PoolKey key;
        SwapParams params;
        uint128 minAmountOut;
    }

    constructor(IPoolManager poolManager_, IHooks hook_) {
        if (address(poolManager_) == address(0) || address(hook_) == address(0)) revert InvalidPool();
        poolManager = poolManager_;
        hook = hook_;
    }

    receive() external payable {}

    function swapExactInput(
        PoolKey calldata key,
        bool zeroForOne,
        uint128 amountIn,
        uint128 minAmountOut,
        address recipient,
        uint256 deadline
    ) external payable returns (uint256 amountOut) {
        if (block.timestamp > deadline) revert Expired();
        if (amountIn == 0 || recipient == address(0)) revert InvalidAmount();
        if (address(key.hooks) != address(hook)) revert InvalidPool();
        Currency input = zeroForOne ? key.currency0 : key.currency1;
        if (Currency.unwrap(input) == address(0)) {
            if (msg.value != amountIn) revert InvalidAmount();
        } else if (msg.value != 0) {
            revert InvalidAmount();
        }

        SwapParams memory params = SwapParams({
            zeroForOne: zeroForOne,
            amountSpecified: -int256(uint256(amountIn)),
            sqrtPriceLimitX96: zeroForOne ? TickMath.MIN_SQRT_PRICE + 1 : TickMath.MAX_SQRT_PRICE - 1
        });
        swapping = true;
        BalanceDelta delta = abi.decode(
            poolManager.unlock(abi.encode(CallbackData(msg.sender, recipient, key, params, minAmountOut))),
            (BalanceDelta)
        );
        swapping = false;
        int128 outputDelta = zeroForOne ? delta.amount1() : delta.amount0();
        if (outputDelta <= 0) revert SlippageExceeded();
        amountOut = uint128(outputDelta);
        _emitPoolSwap(key, zeroForOne, amountIn, amountOut);
        uint256 refund = address(this).balance;
        if (refund > 0) {
            (bool sent,) = payable(msg.sender).call{value: refund}("");
            if (!sent) revert TransferFailed();
        }
    }

    function unlockCallback(bytes calldata rawData) external returns (bytes memory) {
        if (msg.sender != address(poolManager) || !swapping) revert Unauthorized();
        CallbackData memory data = abi.decode(rawData, (CallbackData));
        BalanceDelta delta = poolManager.swap(data.key, data.params, abi.encode(data.payer));
        int128 delta0 = delta.amount0();
        int128 delta1 = delta.amount1();
        _settleOrTake(data.key.currency0, delta0, data.payer, data.recipient);
        _settleOrTake(data.key.currency1, delta1, data.payer, data.recipient);
        int128 outputDelta = data.params.zeroForOne ? delta1 : delta0;
        if (outputDelta <= 0 || uint128(outputDelta) < data.minAmountOut) revert SlippageExceeded();
        return abi.encode(delta);
    }

    function _settleOrTake(Currency currency, int128 delta, address payer, address recipient) private {
        if (delta < 0) {
            uint256 amount = uint128(-delta);
            address asset = Currency.unwrap(currency);
            if (asset == address(0)) {
                poolManager.settle{value: amount}();
            } else {
                poolManager.sync(currency);
                IERC20(asset).safeTransferFrom(payer, address(poolManager), amount);
                poolManager.settle();
            }
        } else if (delta > 0) {
            poolManager.take(currency, recipient, uint128(delta));
        }
    }

    function _emitPoolSwap(PoolKey calldata key, bool zeroForOne, uint128 amountIn, uint256 amountOut) private {
        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        if (currency0 != address(0) && currency1 != address(0)) revert InvalidPool();
        bool isBuy = zeroForOne == (currency0 == address(0));
        address token = currency0 == address(0) ? currency1 : currency0;
        emit PoolSwap(token, msg.sender, isBuy, isBuy ? amountIn : amountOut, isBuy ? amountOut : amountIn);
    }
}
