// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezCurveMath} from "../src/libraries/SqueezCurveMath.sol";

contract SqueezCurveMathHarness {
    function tokensSold(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised)
        external
        pure
        returns (uint256)
    {
        return SqueezCurveMath.tokensSold(virtualHype, virtualTokens, hypeRaised);
    }

    function quoteBuy(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised, uint256 netHypeIn)
        external
        pure
        returns (uint256)
    {
        return SqueezCurveMath.quoteBuy(virtualHype, virtualTokens, hypeRaised, netHypeIn);
    }

    function quoteSell(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised, uint256 tokensIn)
        external
        pure
        returns (uint256)
    {
        return SqueezCurveMath.quoteSell(virtualHype, virtualTokens, hypeRaised, tokensIn);
    }

    function marginalPriceWad(uint256 virtualHype, uint256 virtualTokens, uint256 hypeRaised)
        external
        pure
        returns (uint256)
    {
        return SqueezCurveMath.marginalPriceWad(virtualHype, virtualTokens, hypeRaised);
    }
}

contract SqueezCurveMathTest is Test {
    uint256 internal constant VIRTUAL_HYPE = 160 ether;
    uint256 internal constant VIRTUAL_TOKENS = 1_000_000_000 ether;
    uint256 internal constant THRESHOLD = 400 ether;

    SqueezCurveMathHarness internal math;

    function setUp() public {
        math = new SqueezCurveMathHarness();
    }

    function test_CalibrationSellsFiveSeventhsAtThreshold() public view {
        assertApproxEqAbs(math.tokensSold(VIRTUAL_HYPE, VIRTUAL_TOKENS, THRESHOLD), (VIRTUAL_TOKENS * 5) / 7, 1);
    }

    function test_BuyThenSellReturnsInputWithinRounding() public view {
        uint256 hypeIn = 7 ether;
        uint256 tokensOut = math.quoteBuy(VIRTUAL_HYPE, VIRTUAL_TOKENS, 0, hypeIn);
        uint256 hypeOut = math.quoteSell(VIRTUAL_HYPE, VIRTUAL_TOKENS, hypeIn, tokensOut);
        assertApproxEqAbs(hypeOut, hypeIn, 1);
    }

    function testFuzz_TokensSoldAndPriceAreMonotonic(uint256 first, uint256 second) public view {
        first = bound(first, 0, THRESHOLD);
        second = bound(second, first, THRESHOLD);
        assertLe(
            math.tokensSold(VIRTUAL_HYPE, VIRTUAL_TOKENS, first), math.tokensSold(VIRTUAL_HYPE, VIRTUAL_TOKENS, second)
        );
        assertLe(
            math.marginalPriceWad(VIRTUAL_HYPE, VIRTUAL_TOKENS, first),
            math.marginalPriceWad(VIRTUAL_HYPE, VIRTUAL_TOKENS, second)
        );
    }

    function testFuzz_BuyOutputNeverExceedsRemainingCurveSupply(uint256 raised, uint256 amount) public view {
        raised = bound(raised, 0, THRESHOLD);
        amount = bound(amount, 0, THRESHOLD - raised);
        uint256 soldBefore = math.tokensSold(VIRTUAL_HYPE, VIRTUAL_TOKENS, raised);
        uint256 output = math.quoteBuy(VIRTUAL_HYPE, VIRTUAL_TOKENS, raised, amount);
        uint256 soldAtThreshold = math.tokensSold(VIRTUAL_HYPE, VIRTUAL_TOKENS, THRESHOLD);
        assertLe(output, soldAtThreshold - soldBefore);
    }
}
