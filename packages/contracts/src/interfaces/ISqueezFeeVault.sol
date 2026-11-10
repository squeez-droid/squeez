// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISqueezFeeVault {
    function curveForToken(address token) external view returns (address);
    function registerCurve(address token, address curve) external;
    /// @notice Called by a curve or the hook with the fee for one trade (native HYPE or quote asset).
    function depositFees(address token, address asset, uint256 protocolFee, uint256 creatorFee) external payable;
    /// @notice Deposits base fees plus the separately-accounted launch-protection tax.
    function depositProtectedFees(
        address token,
        address asset,
        uint256 protocolFee,
        uint256 creatorFee,
        uint256 protectionTax
    ) external payable;
    function claimCreatorFees(address token, address asset) external returns (uint256);
    function withdrawBuyback(address asset, address recipient, uint256 amount) external;
}
