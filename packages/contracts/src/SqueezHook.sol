// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {SafeCast} from "@uniswap/v4-core/src/libraries/SafeCast.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";

interface ISqueezHookVault {
    function curveForToken(address token) external view returns (address);
    function depositFees(address token, address asset, uint256 protocolFee, uint256 creatorFee) external payable;
}

interface ISqueezHookCurve {
    function quote() external view returns (address);
    function graduated() external view returns (bool);
    function creatorFeeBps() external view returns (uint16);
}

/// @notice Admission boundary for post-graduation Uniswap v4 pools.
contract SqueezHook is BaseHook {
    using PoolIdLibrary for PoolKey;
    using SafeCast for uint256;
    using SafeERC20 for IERC20;

    error InvalidPool();
    error PoolNotRegistered();
    error ZeroAddress();

    ISqueezHookVault public immutable feeVault;
    mapping(PoolId poolId => address token) public tokenForPool;
    mapping(PoolId poolId => address quote) public quoteForPool;

    event SqueezPoolRegistered(bytes32 indexed poolId, address indexed token, address indexed quote);

    constructor(IPoolManager manager, ISqueezHookVault feeVault_) BaseHook(manager) {
        if (address(feeVault_) == address(0)) revert ZeroAddress();
        feeVault = feeVault_;
    }

    receive() external payable {}

    function getHookPermissions() public pure override returns (Hooks.Permissions memory permissions) {
        permissions.beforeInitialize = true;
        permissions.beforeSwap = true;
        permissions.afterSwap = true;
        permissions.beforeSwapReturnDelta = true;
        permissions.afterSwapReturnDelta = true;
    }

    function _beforeInitialize(address, PoolKey calldata key, uint160) internal override returns (bytes4) {
        (address token, address quote) = _validatePool(key);
        PoolId poolId = key.toId();
        tokenForPool[poolId] = token;
        quoteForPool[poolId] = quote;
        emit SqueezPoolRegistered(PoolId.unwrap(poolId), token, quote);
        return IHooks.beforeInitialize.selector;
    }

    function _beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        PoolId poolId = key.toId();
        address token = tokenForPool[poolId];
        if (token == address(0)) revert PoolNotRegistered();
        address quote = quoteForPool[poolId];
        bool specifiedIsCurrency0 = params.amountSpecified < 0 == params.zeroForOne;
        address specified = Currency.unwrap(specifiedIsCurrency0 ? key.currency0 : key.currency1);
        if (specified != quote) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        uint256 quoteAmount = _absolute(params.amountSpecified);
        (uint256 protocolFee, uint256 creatorFee) = _fees(token, quoteAmount);
        uint256 totalFee = protocolFee + creatorFee;
        _collect(token, quote, protocolFee, creatorFee);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);
    }

    function _afterSwap(address, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        PoolId poolId = key.toId();
        address token = tokenForPool[poolId];
        if (token == address(0)) revert PoolNotRegistered();
        address quote = quoteForPool[poolId];
        bool specifiedIsCurrency0 = params.amountSpecified < 0 == params.zeroForOne;
        address specified = Currency.unwrap(specifiedIsCurrency0 ? key.currency0 : key.currency1);
        if (specified == quote) return (IHooks.afterSwap.selector, 0);

        int128 quoteDelta = quote == Currency.unwrap(key.currency0) ? delta.amount0() : delta.amount1();
        uint256 quoteAmount = quoteDelta < 0 ? uint256(uint128(-quoteDelta)) : uint256(uint128(quoteDelta));
        (uint256 protocolFee, uint256 creatorFee) = _fees(token, quoteAmount);
        uint256 totalFee = protocolFee + creatorFee;
        _collect(token, quote, protocolFee, creatorFee);
        return (IHooks.afterSwap.selector, totalFee.toInt128());
    }

    function _fees(address token, uint256 quoteAmount) private view returns (uint256 protocolFee, uint256 creatorFee) {
        address curve = feeVault.curveForToken(token);
        protocolFee = quoteAmount * SqueezConstants.PROTOCOL_FEE_BPS / SqueezConstants.BPS;
        creatorFee = quoteAmount * ISqueezHookCurve(curve).creatorFeeBps() / SqueezConstants.BPS;
    }

    function _collect(address token, address quote, uint256 protocolFee, uint256 creatorFee) private {
        uint256 totalFee = protocolFee + creatorFee;
        if (totalFee == 0) return;
        Currency quoteCurrency = Currency.wrap(quote);
        poolManager.take(quoteCurrency, address(this), totalFee);
        if (quote == address(0)) {
            feeVault.depositFees{value: totalFee}(token, quote, protocolFee, creatorFee);
        } else {
            IERC20(quote).forceApprove(address(feeVault), totalFee);
            feeVault.depositFees(token, quote, protocolFee, creatorFee);
        }
    }

    function _absolute(int256 value) private pure returns (uint256) {
        return value < 0 ? uint256(-value) : uint256(value);
    }

    function _validatePool(PoolKey calldata key) private view returns (address token, address quote) {
        address currency0 = Currency.unwrap(key.currency0);
        address currency1 = Currency.unwrap(key.currency1);
        address curve0 = currency0 == address(0) ? address(0) : feeVault.curveForToken(currency0);
        address curve1 = currency1 == address(0) ? address(0) : feeVault.curveForToken(currency1);
        if ((curve0 == address(0)) == (curve1 == address(0))) revert InvalidPool();

        if (curve0 != address(0)) {
            (token, quote) = (currency0, currency1);
            _validateCurve(curve0, quote);
        } else {
            (token, quote) = (currency1, currency0);
            _validateCurve(curve1, quote);
        }
    }

    function _validateCurve(address curve, address quote) private view {
        if (!ISqueezHookCurve(curve).graduated() || ISqueezHookCurve(curve).quote() != quote) revert InvalidPool();
    }
}
