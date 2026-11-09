// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Chain-specific boundary for creating and permanently locking a graduated pool.
/// The Curve remains the source of truth for retry/idempotency; adapters must revert atomically on failure.
interface ISqueezGraduationAdapter {
    function graduate(address token, address quote, uint256 quoteAmount, uint256 tokenAmount)
        external
        payable
        returns (address pool, uint256 quoteUsed, uint256 tokenUsed);
}
