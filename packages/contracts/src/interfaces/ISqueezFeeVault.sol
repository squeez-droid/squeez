// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISqueezFeeVault {
    function registerCurve(address token, address curve) external;
    /// @notice Called by a curve or the hook with the fee for one trade (native HYPE or quote asset).
    function depositFees(address token, address asset, uint256 protocolFee, uint256 creatorFee) external payable;
    function claimCreatorFees(address token, address asset) external returns (uint256);
}
