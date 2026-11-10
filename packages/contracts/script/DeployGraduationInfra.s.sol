// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {SqueezLiquidityLocker, ILockerFeeVault} from "../src/SqueezLiquidityLocker.sol";
import {SqueezV4GraduationAdapter, IGraduationVault, IGraduationLocker} from "../src/SqueezV4GraduationAdapter.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";

/// @notice Deploys the immutable, ownerless locker only after official v4 PositionManager bytecode is verified.
contract DeployGraduationInfra is Script {
    function run() external {
        address feeVault = vm.envAddress("FEE_VAULT_ADDRESS");
        address positionManager = vm.envAddress("POSITION_MANAGER");
        address permit2 = vm.envAddress("PERMIT2");
        address hook = vm.envAddress("SQUEEZ_HOOK_ADDRESS");
        uint24 lpFee = uint24(vm.envUint("V4_LP_FEE_BPS"));
        int24 tickSpacing = int24(int256(vm.envInt("V4_TICK_SPACING")));
        require(feeVault.code.length > 0, "fee vault has no code");
        require(positionManager.code.length > 0, "position manager has no code");
        require(permit2.code.length > 0, "permit2 has no code");
        require(hook.code.length > 0, "hook has no code");

        uint256 signerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (signerKey == 0) signerKey = vm.envUint("UPGRADE_ADMIN_PRIVATE_KEY");
        address deployer = vm.addr(signerKey);
        vm.startBroadcast(signerKey);
        SqueezLiquidityLocker locker = new SqueezLiquidityLocker(ILockerFeeVault(feeVault), IERC721(positionManager));
        SqueezV4GraduationAdapter adapter = new SqueezV4GraduationAdapter(
            IGraduationVault(feeVault),
            IPositionManager(positionManager),
            IAllowanceTransfer(permit2),
            IGraduationLocker(address(locker)),
            IHooks(hook),
            lpFee,
            tickSpacing
        );
        vm.stopBroadcast();

        require(address(locker.feeVault()) == feeVault, "locker vault");
        require(address(locker.positionManager()) == positionManager, "locker manager");
        require(address(adapter.positionManager()) == positionManager, "adapter manager");
        require(address(adapter.locker()) == address(locker), "adapter locker");
        require(address(adapter.hook()) == hook, "adapter hook");
        string memory object = "graduationInfra";
        vm.serializeString(object, "network", vm.envString("SQUEEZ_NETWORK"));
        vm.serializeUint(object, "chainId", block.chainid);
        vm.serializeAddress(object, "deployer", deployer);
        vm.serializeAddress(object, "feeVault", feeVault);
        vm.serializeAddress(object, "positionManager", positionManager);
        vm.serializeAddress(object, "liquidityLocker", address(locker));
        vm.serializeAddress(object, "squeezHook", hook);
        vm.serializeAddress(object, "permit2", permit2);
        vm.serializeUint(object, "lpFeeBps", lpFee);
        vm.serializeInt(object, "tickSpacing", tickSpacing);
        string memory json = vm.serializeAddress(object, "graduationAdapter", address(adapter));
        vm.writeJson(json, _deploymentFile("-graduation-infra.json"));
    }

    function _deploymentFile(string memory suffix) private view returns (string memory) {
        string memory chain = vm.envString("SQUEEZ_CHAIN");
        string memory prefix = keccak256(bytes(chain)) == keccak256("elysium") ? "" : string.concat(chain, "/");
        return string.concat(vm.projectRoot(), "/deployments/", prefix, vm.envString("SQUEEZ_NETWORK"), suffix);
    }
}
