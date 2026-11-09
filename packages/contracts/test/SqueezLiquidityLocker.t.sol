// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {SqueezLiquidityLocker, ILockerFeeVault} from "../src/SqueezLiquidityLocker.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {ProxyTestBase} from "./ProxyTestBase.sol";

contract MockPositionManager is ERC721 {
    constructor() ERC721("Mock v4 Position", "MV4") {}

    function mint(address recipient, uint256 positionId) external {
        _mint(recipient, positionId);
    }
}

contract MockLockerCurve {
    address public immutable factory;
    address public token;

    constructor(address factory_) {
        factory = factory_;
    }

    function setToken(address token_) external {
        token = token_;
    }

    function executeLock(SqueezLiquidityLocker locker, MockPositionManager manager, uint256 id, uint256 amount)
        external
    {
        SqueezToken(token).approve(address(locker), amount);
        manager.approve(address(locker), id);
        locker.lock(token, id, amount);
    }
}

contract SqueezLiquidityLockerTest is Test, ProxyTestBase {
    SqueezFeeVault internal vault;
    SqueezLiquidityLocker internal locker;
    MockPositionManager internal manager;
    MockLockerCurve internal curve;
    SqueezToken internal token;

    function setUp() public {
        vault = _deployVault(address(this), makeAddr("treasury"));
        manager = new MockPositionManager();
        locker = new SqueezLiquidityLocker(ILockerFeeVault(address(vault)), manager);
        curve = new MockLockerCurve(address(this));
        token = new SqueezToken("Locker Test", "LOCK", "ipfs://locker", address(curve));
        curve.setToken(address(token));
        vault.registerCurve(address(token), address(curve));
        manager.mint(address(curve), 7);
    }

    function test_RegisteredCurveAtomicallyLocksTokensAndPosition() public {
        curve.executeLock(locker, manager, 7, 4 ether);
        assertTrue(locker.isLocked(address(token)));
        assertEq(locker.positionForToken(address(token)), 7);
        assertEq(locker.lockedTokenAmount(address(token)), 4 ether);
        assertEq(locker.tokenForPosition(7), address(token));
        assertEq(token.balanceOf(address(locker)), 4 ether);
        assertEq(manager.ownerOf(7), address(locker));
    }

    function test_UnregisteredCallerCannotLock() public {
        vm.expectRevert(SqueezLiquidityLocker.Unauthorized.selector);
        locker.lock(address(token), 7, 1 ether);
    }

    function test_TokenCannotBeLockedTwice() public {
        curve.executeLock(locker, manager, 7, 4 ether);
        manager.mint(address(curve), 8);
        vm.expectRevert(SqueezLiquidityLocker.AlreadyLocked.selector);
        curve.executeLock(locker, manager, 8, 1 ether);
    }

    function test_LockRevertsAtomicallyWithoutApprovals() public {
        vm.prank(address(curve));
        vm.expectRevert();
        locker.lock(address(token), 7, 4 ether);
        assertFalse(locker.isLocked(address(token)));
        assertEq(locker.tokenForPosition(7), address(0));
        assertEq(token.balanceOf(address(locker)), 0);
        assertEq(manager.ownerOf(7), address(curve));
    }

    function test_RejectsNFTsFromUnknownCollections() public {
        MockPositionManager unknown = new MockPositionManager();
        unknown.mint(address(this), 1);
        vm.expectRevert(SqueezLiquidityLocker.Unauthorized.selector);
        unknown.safeTransferFrom(address(this), address(locker), 1);
    }
}
