// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Immutable protocol constants. Mirrored in packages/shared/src/protocol.ts.
library SqueezConstants {
    uint256 internal constant BPS = 10_000;
    /// @dev Fixed 1% protocol fee on every trade (curve + v4 hook).
    uint256 internal constant PROTOCOL_FEE_BPS = 100;
    /// @dev Creator fee range 0–10%, validated on-chain at launch.
    uint256 internal constant MAX_CREATOR_FEE_BPS = 1_000;
    /// @dev 80% of the protocol fee goes to TWAP buyback & burn of $SQUEEZ, 20% to treasury.
    uint256 internal constant BURN_BPS_OF_PROTOCOL = 8_000;
    /// @dev 1B tokens, 18 decimals, 100% minted to the curve.
    uint256 internal constant TOTAL_SUPPLY = 1_000_000_000 ether;
}
