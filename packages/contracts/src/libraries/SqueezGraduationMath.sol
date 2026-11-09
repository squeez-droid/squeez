// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Currency ordering and initial-price math shared by graduation adapters.
library SqueezGraduationMath {
    error InvalidReserves();
    error PriceOutOfRange();

    uint256 private constant Q128 = 1 << 128;
    uint256 private constant Q32 = 1 << 32;

    /// @dev Native HYPE is address(0), matching v4 Currency semantics.
    function poolKey(address token, address quote) internal pure returns (address currency0, address currency1) {
        if (token == quote) revert InvalidReserves();
        return token < quote ? (token, quote) : (quote, token);
    }

    /// @notice Returns sqrt(amount1 / amount0) * 2^96 using a Q128 intermediate.
    /// Reserve amounts must already be expressed in their raw token units.
    function sqrtPriceX96(address token, address quote, uint256 tokenReserve, uint256 quoteReserve)
        internal
        pure
        returns (uint160 price)
    {
        if (tokenReserve == 0 || quoteReserve == 0) revert InvalidReserves();
        (address currency0,) = poolKey(token, quote);
        uint256 amount0 = currency0 == token ? tokenReserve : quoteReserve;
        uint256 amount1 = currency0 == token ? quoteReserve : tokenReserve;
        if (amount1 / amount0 > type(uint128).max) revert PriceOutOfRange();

        uint256 ratioX128 = Math.mulDiv(amount1, Q128, amount0);
        uint256 result = Math.sqrt(ratioX128) * Q32;
        if (result == 0 || result > type(uint160).max) revert PriceOutOfRange();
        // forge-lint: disable-next-line(unsafe-typecast)
        price = uint160(result);
    }
}
