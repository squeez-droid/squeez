// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezV4GraduationAdapter, IGraduationVault, IGraduationLocker} from "../src/SqueezV4GraduationAdapter.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

contract SqueezV4GraduationAdapterTest is Test {
    SqueezV4GraduationAdapter adapter;

    function setUp() public {
        adapter = new SqueezV4GraduationAdapter(
            IGraduationVault(makeAddr("vault")),
            IPositionManager(makeAddr("positionManager")),
            IAllowanceTransfer(makeAddr("permit2")),
            IGraduationLocker(makeAddr("locker")),
            IHooks(makeAddr("hook")),
            0,
            60
        );
    }

    function test_PonsSplitSeedsTenFortyNinthsAndLocksFourFortyNinths() public view {
        uint256 totalSupply = 1_000_000_000 ether;
        uint256 remainingAfterCurve = totalSupply * 2 / 7;
        uint256 lpTokens = adapter.liquidityTokenAmount(remainingAfterCurve);
        uint256 lockedResidual = remainingAfterCurve - lpTokens;

        assertApproxEqAbs(lpTokens, totalSupply * 10 / 49, 1);
        assertApproxEqAbs(lockedResidual, totalSupply * 4 / 49, 1);
        assertEq(lpTokens + lockedResidual, remainingAfterCurve);
    }
}
