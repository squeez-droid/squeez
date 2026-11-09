// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezGraduationMath} from "../src/libraries/SqueezGraduationMath.sol";

contract SqueezGraduationMathHarness {
    function poolKey(address token, address quote) external pure returns (address, address) {
        return SqueezGraduationMath.poolKey(token, quote);
    }

    function sqrtPriceX96(address token, address quote, uint256 tokenReserve, uint256 quoteReserve)
        external
        pure
        returns (uint160)
    {
        return SqueezGraduationMath.sqrtPriceX96(token, quote, tokenReserve, quoteReserve);
    }
}

contract SqueezGraduationMathTest is Test {
    SqueezGraduationMathHarness internal harness = new SqueezGraduationMathHarness();

    function test_NativeHypeSortsBeforeTokenAndUsesInversePrice() public view {
        address token = address(0x1234);
        (address currency0, address currency1) = harness.poolKey(token, address(0));
        assertEq(currency0, address(0));
        assertEq(currency1, token);

        uint160 price = harness.sqrtPriceX96(token, address(0), 100 ether, 4 ether);
        assertApproxEqAbs(uint256(price), uint256(5 * (1 << 96)), 1 << 33);
    }

    function test_Erc20OrderingChoosesCorrectReserveRatio() public view {
        address token = address(0x1000);
        address quote = address(0x2000);
        uint160 price = harness.sqrtPriceX96(token, quote, 4 ether, 100 ether);
        assertApproxEqAbs(uint256(price), uint256(5 * (1 << 96)), 1 << 33);

        price = harness.sqrtPriceX96(quote, token, 100 ether, 4 ether);
        assertApproxEqAbs(uint256(price), uint256(5 * (1 << 96)), 1 << 33);
    }

    function test_FinalCurveReservesProduceStableNonZeroPrice() public view {
        uint256 tokenReserve = (uint256(1_000_000_000 ether) * 2) / 7;
        uint256 hypeReserve = 560 ether;
        uint160 price = harness.sqrtPriceX96(address(0x1234), address(0), tokenReserve, hypeReserve);
        assertGt(price, 0);
        assertLt(price, type(uint160).max);
    }

    function test_RejectsInvalidPairOrReserves() public {
        vm.expectRevert(SqueezGraduationMath.InvalidReserves.selector);
        harness.poolKey(address(1), address(1));
        vm.expectRevert(SqueezGraduationMath.InvalidReserves.selector);
        harness.sqrtPriceX96(address(1), address(2), 0, 1);
    }
}
