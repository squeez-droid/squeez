// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Pure virtual-reserve constant-product math used by every Squeez curve.
library SqueezCurveMath {
    error InvalidCurveParameters();
    error InvalidCurveState();

    function tokensSold(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised)
        internal
        pure
        returns (uint256)
    {
        if (virtualHype == 0 || virtualTokens == 0) revert InvalidCurveParameters();
        uint256 tokensRemaining = Math.mulDiv(virtualHype, virtualTokens, virtualHype + hypeRaised);
        return virtualTokens - tokensRemaining;
    }

    function quoteBuy(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised, uint256 netHypeIn)
        internal
        pure
        returns (uint256 tokensOut)
    {
        if (netHypeIn == 0) return 0;
        uint256 soldBefore = tokensSold(virtualHype, virtualTokens, hypeRaised);
        uint256 soldAfter = tokensSold(virtualHype, virtualTokens, hypeRaised + netHypeIn);
        return soldAfter - soldBefore;
    }

    function quoteSell(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised, uint256 tokensIn)
        internal
        pure
        returns (uint256 grossHypeOut)
    {
        if (tokensIn == 0) return 0;
        uint256 soldBefore = tokensSold(virtualHype, virtualTokens, hypeRaised);
        if (tokensIn > soldBefore) revert InvalidCurveState();

        uint256 soldAfter = soldBefore - tokensIn;
        uint256 tokensRemainingAfter = virtualTokens - soldAfter;
        uint256 hypeReserveAfter = Math.mulDiv(virtualHype, virtualTokens, tokensRemainingAfter);
        if (hypeReserveAfter < virtualHype) revert InvalidCurveState();
        uint256 raisedAfter = hypeReserveAfter - virtualHype;
        if (raisedAfter > hypeRaised) revert InvalidCurveState();
        return hypeRaised - raisedAfter;
    }

    function marginalPriceWad(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised)
        internal
        pure
        returns (uint256)
    {
        if (virtualHype == 0 || virtualTokens == 0) revert InvalidCurveParameters();
        uint256 currentHypeReserve = virtualHype + hypeRaised;
        return Math.mulDiv(currentHypeReserve, currentHypeReserve * 1e18, virtualHype * virtualTokens);
    }
}
