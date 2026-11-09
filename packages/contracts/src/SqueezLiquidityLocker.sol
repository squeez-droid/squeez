// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Holds graduated v4 LP positions and the locked 4/49 supply forever.
/// Intentionally has NO withdraw function. Only LP fee collection (if any) is forwarded to the vault.
contract SqueezLiquidityLocker {
    event PositionLocked(address indexed token, uint256 positionId, uint256 lockedTokens);

    // TODO: accept v4 position (PositionManager NFT), record per token, forward collected LP fees to SqueezFeeVault.
}
