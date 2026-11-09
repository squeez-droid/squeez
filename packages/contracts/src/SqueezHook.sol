// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Uniswap v4 hook for graduated pools. In beforeSwap/afterSwap it takes the 1% protocol fee
/// + the token's creatorFeeBps from the quote side and sends it to SqueezFeeVault, emitting PoolSwap.
///
/// Setup: `forge install uniswap/v4-periphery --no-git`, add the v4 remappings to foundry.toml,
/// then inherit BaseHook and mine a hook address with the right permission flags.
contract SqueezHook {
    // TODO: implement once v4-core/v4-periphery are added and the Elysium PoolManager address is known.
}
