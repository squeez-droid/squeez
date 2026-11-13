// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezHook, ISqueezHookVault} from "../src/SqueezHook.sol";
import {SqueezLiquidityLocker, ILockerFeeVault} from "../src/SqueezLiquidityLocker.sol";
import {SqueezSwapRouter} from "../src/SqueezSwapRouter.sol";
import {SqueezV4GraduationAdapter, IGraduationVault, IGraduationLocker} from "../src/SqueezV4GraduationAdapter.sol";

/// @notice Simulates the complete Squeez-owned v4 layer against a supported mainnet without writing deployment files.
contract SimulateMainnetV4 is Script {
    address internal constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function run() external {
        string memory chain = vm.envString("SQUEEZ_CHAIN");
        bool robinhood = keccak256(bytes(chain)) == keccak256("robinhood");
        bool hyperevm = keccak256(bytes(chain)) == keccak256("hyperevm");
        bool elysium = keccak256(bytes(chain)) == keccak256("elysium");
        require(
            (robinhood && block.chainid == 4663) || (hyperevm && block.chainid == 999)
                || (elysium && block.chainid == 99901),
            "unsupported mainnet"
        );
        require(keccak256(bytes(vm.envString("SQUEEZ_NETWORK"))) == keccak256("mainnet"), "wrong network");

        address poolManager = vm.envAddress("POOL_MANAGER");
        address positionManager = vm.envAddress("POSITION_MANAGER");
        address permit2 = vm.envAddress("PERMIT2");
        address feeVault = vm.envAddress("FEE_VAULT_ADDRESS");
        uint24 lpFee = uint24(vm.envUint("V4_LP_FEE_BPS"));
        int24 tickSpacing = int24(int256(vm.envInt("V4_TICK_SPACING")));
        require(poolManager.code.length > 0, "pool manager has no code");
        require(positionManager.code.length > 0, "position manager has no code");
        require(permit2.code.length > 0, "Permit2 has no code");
        require(feeVault.code.length > 0, "FeeVault has no code");
        require(CREATE2_DEPLOYER.code.length > 0, "CREATE2 deployer unavailable");
        address expectedOwner =
            robinhood ? vm.envAddress("GOVERNANCE_TIMELOCK_ADDRESS") : vm.envAddress("ADMIN_MULTISIG");
        require(SqueezFeeVault(payable(feeVault)).owner() == expectedOwner, "unexpected vault owner");

        bytes memory constructorArgs = abi.encode(IPoolManager(poolManager), ISqueezHookVault(feeVault));
        uint160 flags = Hooks.BEFORE_INITIALIZE_FLAG | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG
            | Hooks.BEFORE_SWAP_RETURNS_DELTA_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG;
        (address expectedHook, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(SqueezHook).creationCode, constructorArgs);
        bytes memory initCode = abi.encodePacked(type(SqueezHook).creationCode, constructorArgs);

        uint256 signerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (signerKey == 0) signerKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        vm.startBroadcast(signerKey);
        (bool deployed,) = CREATE2_DEPLOYER.call(abi.encodePacked(salt, initCode));
        require(deployed && expectedHook.code.length > 0, "hook simulation failed");

        SqueezLiquidityLocker locker = new SqueezLiquidityLocker(ILockerFeeVault(feeVault), IERC721(positionManager));
        SqueezV4GraduationAdapter adapter = new SqueezV4GraduationAdapter(
            IGraduationVault(feeVault),
            IPositionManager(positionManager),
            IAllowanceTransfer(permit2),
            IGraduationLocker(address(locker)),
            IHooks(expectedHook),
            lpFee,
            tickSpacing
        );
        SqueezSwapRouter router = new SqueezSwapRouter(IPoolManager(poolManager), IHooks(expectedHook));
        vm.stopBroadcast();

        require(address(SqueezHook(payable(expectedHook)).poolManager()) == poolManager, "hook manager mismatch");
        require(address(SqueezHook(payable(expectedHook)).feeVault()) == feeVault, "hook vault mismatch");
        require(address(adapter.positionManager()) == positionManager, "adapter manager mismatch");
        require(address(adapter.locker()) == address(locker), "adapter locker mismatch");
        require(address(adapter.hook()) == expectedHook, "adapter hook mismatch");
        require(address(router.poolManager()) == poolManager, "router manager mismatch");
        require(address(router.hook()) == expectedHook, "router hook mismatch");

        console2.log("SqueezHook", expectedHook);
        console2.log("HookSalt");
        console2.logBytes32(salt);
        console2.log("LiquidityLocker", address(locker));
        console2.log("GraduationAdapter", address(adapter));
        console2.log("SwapRouter", address(router));
    }
}
