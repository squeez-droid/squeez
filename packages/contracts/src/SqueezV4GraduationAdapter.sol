// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {LiquidityAmounts} from "@uniswap/v4-periphery/src/libraries/LiquidityAmounts.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {ISqueezGraduationAdapter} from "./interfaces/ISqueezGraduationAdapter.sol";
import {SqueezGraduationMath} from "./libraries/SqueezGraduationMath.sol";

interface IGraduationVault {
    function curveForToken(address token) external view returns (address);
}

interface IGraduationCurve {
    function quote() external view returns (address);
}

interface IGraduationLocker {
    function lock(address token, uint256 positionId, uint256 lockedTokens) external payable;
}

/// @notice Atomic native-HYPE graduation into one permanently locked full-range Uniswap v4 position.
contract SqueezV4GraduationAdapter is ISqueezGraduationAdapter {
    using SafeCast for uint256;
    using SafeERC20 for IERC20;
    using PoolIdLibrary for PoolKey;

    error Unauthorized();
    error InvalidGraduation();
    error UnsupportedQuote();

    IGraduationVault public immutable feeVault;
    IPositionManager public immutable positionManager;
    IAllowanceTransfer public immutable permit2;
    IGraduationLocker public immutable locker;
    IHooks public immutable hook;
    int24 public immutable tickSpacing;
    uint24 public immutable lpFee;
    uint256 public constant LP_SHARE_OF_REMAINING_NUMERATOR = 5;
    uint256 public constant LP_SHARE_OF_REMAINING_DENOMINATOR = 7;

    struct MintPlan {
        PoolKey key;
        uint160 sqrtPriceX96;
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
        uint256 amount0;
        uint256 amount1;
    }

    constructor(
        IGraduationVault feeVault_,
        IPositionManager positionManager_,
        IAllowanceTransfer permit2_,
        IGraduationLocker locker_,
        IHooks hook_,
        uint24 lpFee_,
        int24 tickSpacing_
    ) {
        if (
            address(feeVault_) == address(0) || address(positionManager_) == address(0)
                || address(permit2_) == address(0) || address(locker_) == address(0) || address(hook_) == address(0)
                || tickSpacing_ <= 0
        ) revert InvalidGraduation();
        feeVault = feeVault_;
        positionManager = positionManager_;
        permit2 = permit2_;
        locker = locker_;
        hook = hook_;
        lpFee = lpFee_;
        tickSpacing = tickSpacing_;
    }

    function graduate(address token, address quote, uint256 quoteAmount, uint256 tokenAmount)
        external
        payable
        returns (address pool, uint256 quoteUsed, uint256 tokenUsed)
    {
        if (feeVault.curveForToken(token) != msg.sender) revert Unauthorized();
        if (IGraduationCurve(msg.sender).quote() != quote || tokenAmount == 0 || quoteAmount == 0) {
            revert InvalidGraduation();
        }
        if (quote != address(0)) revert UnsupportedQuote();
        if (msg.value != quoteAmount || address(this).balance != quoteAmount) revert InvalidGraduation();

        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        MintPlan memory plan = _buildPlan(token, quote, tokenAmount, quoteAmount);
        uint256 positionId = _mintPosition(token, tokenAmount, quoteAmount, plan);
        _lockPosition(token, positionId);

        PoolId poolId = plan.key.toId();
        pool = address(uint160(uint256(PoolId.unwrap(poolId))));
        if (pool == address(0)) revert InvalidGraduation();
        return (pool, quoteAmount, tokenAmount);
    }

    function _buildPlan(address token, address quote, uint256 tokenAmount, uint256 quoteAmount)
        private
        view
        returns (MintPlan memory plan)
    {
        (address currency0Address, address currency1Address) = SqueezGraduationMath.poolKey(token, quote);
        plan.key = PoolKey({
            currency0: Currency.wrap(currency0Address),
            currency1: Currency.wrap(currency1Address),
            fee: lpFee,
            tickSpacing: tickSpacing,
            hooks: hook
        });
        uint256 lpTokenAmount = liquidityTokenAmount(tokenAmount);
        plan.sqrtPriceX96 = SqueezGraduationMath.sqrtPriceX96(token, quote, lpTokenAmount, quoteAmount);
        plan.tickLower = TickMath.minUsableTick(tickSpacing);
        plan.tickUpper = TickMath.maxUsableTick(tickSpacing);
        plan.amount0 = currency0Address == token ? lpTokenAmount : quoteAmount;
        plan.amount1 = currency0Address == token ? quoteAmount : lpTokenAmount;
        plan.liquidity = LiquidityAmounts.getLiquidityForAmounts(
            plan.sqrtPriceX96,
            TickMath.getSqrtPriceAtTick(plan.tickLower),
            TickMath.getSqrtPriceAtTick(plan.tickUpper),
            plan.amount0,
            plan.amount1
        );
        if (plan.liquidity == 0) revert InvalidGraduation();
    }

    /// @notice Pons-compatible split: 5/7 of the post-curve remainder (10/49 total supply) seeds LP.
    /// The other 2/7 of the remainder (4/49 total supply) stays in the adapter and is locked as residual.
    function liquidityTokenAmount(uint256 remainingTokenAmount) public pure returns (uint256) {
        return remainingTokenAmount * LP_SHARE_OF_REMAINING_NUMERATOR / LP_SHARE_OF_REMAINING_DENOMINATOR;
    }

    function _mintPosition(address token, uint256 tokenAmount, uint256 quoteAmount, MintPlan memory plan)
        private
        returns (uint256 positionId)
    {
        IERC20(token).forceApprove(address(permit2), tokenAmount);
        permit2.approve(token, address(positionManager), tokenAmount.toUint160(), type(uint48).max);
        positionId = positionManager.nextTokenId();
        positionManager.initializePool(plan.key, plan.sqrtPriceX96);
        bytes memory actions = abi.encodePacked(
            bytes1(uint8(Actions.MINT_POSITION)),
            bytes1(uint8(Actions.CLOSE_CURRENCY)),
            bytes1(uint8(Actions.CLOSE_CURRENCY))
        );
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            plan.key,
            plan.tickLower,
            plan.tickUpper,
            plan.liquidity,
            plan.amount0.toUint128(),
            plan.amount1.toUint128(),
            address(this),
            bytes("")
        );
        params[1] = abi.encode(plan.key.currency0);
        params[2] = abi.encode(plan.key.currency1);
        positionManager.modifyLiquidities{value: quoteAmount}(abi.encode(actions, params), block.timestamp);
        permit2.approve(token, address(positionManager), 0, 0);
        IERC20(token).forceApprove(address(permit2), 0);
    }

    function _lockPosition(address token, uint256 positionId) private {
        uint256 residualTokens = IERC20(token).balanceOf(address(this));
        uint256 residualNative = address(this).balance;
        IERC20(token).forceApprove(address(locker), residualTokens);
        IERC721(address(positionManager)).approve(address(locker), positionId);
        locker.lock{value: residualNative}(token, positionId, residualTokens);
        IERC20(token).forceApprove(address(locker), 0);
    }
}
