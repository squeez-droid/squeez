// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {SqueezHook, ISqueezHookVault} from "../src/SqueezHook.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta, toBalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockHookToken is ERC20 {
    constructor(string memory name_) ERC20(name_, name_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract MockHookVault {
    mapping(address => address) public curveForToken;
    uint256 public protocolFees;
    uint256 public creatorFees;

    function setCurve(address token, address curve) external {
        curveForToken[token] = curve;
    }

    function depositFees(address, address asset, uint256 protocolFee, uint256 creatorFee) external payable {
        uint256 total = protocolFee + creatorFee;
        if (asset == address(0)) require(msg.value == total);
        else MockHookToken(asset).transferFrom(msg.sender, address(this), total);
        protocolFees += protocolFee;
        creatorFees += creatorFee;
    }
}

contract MockHookCurve {
    address public quote;
    bool public graduated;
    uint16 public creatorFeeBps = 200;

    constructor(address quote_, bool graduated_) {
        quote = quote_;
        graduated = graduated_;
    }
}

contract MockHookPoolManager {
    receive() external payable {}

    function take(Currency currency, address to, uint256 amount) external {
        address asset = Currency.unwrap(currency);
        if (asset == address(0)) payable(to).transfer(amount);
        else MockHookToken(asset).transfer(to, amount);
    }
}

contract TestableSqueezHook is SqueezHook {
    constructor(IPoolManager manager, ISqueezHookVault vault) SqueezHook(manager, vault) {}
    function validateHookAddress(BaseHook) internal pure override {}
}

contract SqueezHookTest is Test {
    using BeforeSwapDeltaLibrary for BeforeSwapDelta;
    MockHookPoolManager manager;
    address token = address(0x1000);
    MockHookToken quoteToken;
    address quote;
    MockHookVault vault;
    TestableSqueezHook hook;

    function setUp() public {
        vault = new MockHookVault();
        manager = new MockHookPoolManager();
        quoteToken = new MockHookToken("QUOTE");
        quote = address(quoteToken);
        hook = new TestableSqueezHook(IPoolManager(address(manager)), ISqueezHookVault(address(vault)));
        quoteToken.mint(address(manager), 1_000_000 ether);
    }

    function testPermissionsIncludeAdmissionAndFeeDeltas() public view {
        assertTrue(hook.getHookPermissions().beforeInitialize);
        assertTrue(hook.getHookPermissions().beforeSwap);
        assertTrue(hook.getHookPermissions().afterSwap);
        assertTrue(hook.getHookPermissions().beforeSwapReturnDelta);
        assertTrue(hook.getHookPermissions().afterSwapReturnDelta);
    }

    function testAcceptsRegisteredGraduatedTokenQuotePool() public {
        PoolKey memory key = _registerPool(token, quote);
        vm.prank(address(manager));
        (bytes4 selector,,) = hook.beforeSwap(address(this), key, SwapParams(false, 1, 1), "");
        assertEq(selector, IHooks.beforeSwap.selector);
    }

    function testRejectsUnregisteredPool() public {
        PoolKey memory key = _key(token, quote);
        vm.prank(address(manager));
        vm.expectRevert(SqueezHook.InvalidPool.selector);
        hook.beforeInitialize(address(this), key, 1);
    }

    function testRejectsWrongQuoteAsset() public {
        vault.setCurve(token, address(new MockHookCurve(quote, true)));
        PoolKey memory key = _key(token, address(0x3000));
        vm.prank(address(manager));
        vm.expectRevert(SqueezHook.InvalidPool.selector);
        hook.beforeInitialize(address(this), key, 1);
    }

    function testRejectsCurveBeforeGraduation() public {
        vault.setCurve(token, address(new MockHookCurve(quote, false)));
        PoolKey memory key = _key(token, quote);
        vm.prank(address(manager));
        vm.expectRevert(SqueezHook.InvalidPool.selector);
        hook.beforeInitialize(address(this), key, 1);
    }

    function testRejectsSwapBeforePoolRegistration() public {
        PoolKey memory key = _key(token, quote);
        vm.prank(address(manager));
        vm.expectRevert(SqueezHook.PoolNotRegistered.selector);
        hook.beforeSwap(address(this), key, SwapParams(false, 1, 1), "");
    }

    function testChargesQuoteWhenQuoteIsSpecified() public {
        PoolKey memory key = _registerPool(token, quote);
        bool zeroForOne = quote < token;
        vm.prank(address(manager));
        (, BeforeSwapDelta feeDelta,) = hook.beforeSwap(address(this), key, SwapParams(zeroForOne, -10_000, 1), "");

        assertEq(feeDelta.getSpecifiedDelta(), 300);
        _assertFees();
    }

    function testChargesQuoteWhenQuoteIsUnspecified() public {
        PoolKey memory key = _registerPool(token, quote);
        bool zeroForOne = token < quote;
        BalanceDelta delta = quote < token ? toBalanceDelta(10_000, -5_000) : toBalanceDelta(-5_000, 10_000);
        vm.prank(address(manager));
        (, int128 feeDelta) = hook.afterSwap(address(this), key, SwapParams(zeroForOne, -5_000, 1), delta, "");

        assertEq(feeDelta, 300);
        _assertFees();
    }

    function testChargesSpecifiedQuoteForExactOutput() public {
        PoolKey memory key = _registerPool(token, quote);
        bool zeroForOne = !(quote < token);
        vm.prank(address(manager));
        (, BeforeSwapDelta feeDelta,) = hook.beforeSwap(address(this), key, SwapParams(zeroForOne, 10_000, 1), "");

        assertEq(feeDelta.getSpecifiedDelta(), 300);
        _assertFees();
    }

    function testChargesUnspecifiedQuoteForExactOutput() public {
        PoolKey memory key = _registerPool(token, quote);
        bool zeroForOne = !(token < quote);
        BalanceDelta delta = quote < token ? toBalanceDelta(-10_000, 5_000) : toBalanceDelta(5_000, -10_000);
        vm.prank(address(manager));
        (, int128 feeDelta) = hook.afterSwap(address(this), key, SwapParams(zeroForOne, 5_000, 1), delta, "");

        assertEq(feeDelta, 300);
        _assertFees();
    }

    function testChargesNativeQuoteAndDepositsValue() public {
        PoolKey memory key = _registerPool(token, address(0));
        vm.deal(address(manager), 1 ether);
        vm.prank(address(manager));
        (, BeforeSwapDelta feeDelta,) = hook.beforeSwap(address(this), key, SwapParams(true, -10_000, 1), "");

        assertEq(feeDelta.getSpecifiedDelta(), 300);
        assertEq(vault.protocolFees(), 100);
        assertEq(vault.creatorFees(), 200);
        assertEq(address(vault).balance, 300);
    }

    function _assertFees() private view {
        assertEq(vault.protocolFees(), 100);
        assertEq(vault.creatorFees(), 200);
        assertEq(quoteToken.balanceOf(address(vault)), 300);
    }

    function _registerPool(address token_, address quote_) private returns (PoolKey memory key) {
        vault.setCurve(token_, address(new MockHookCurve(quote_, true)));
        key = _key(token_, quote_);
        vm.prank(address(manager));
        assertEq(hook.beforeInitialize(address(this), key, 1), IHooks.beforeInitialize.selector);
    }

    function _key(address a, address b) private view returns (PoolKey memory key) {
        (address currency0, address currency1) = a < b ? (a, b) : (b, a);
        key = PoolKey(Currency.wrap(currency0), Currency.wrap(currency1), 0, 60, IHooks(address(hook)));
    }
}
