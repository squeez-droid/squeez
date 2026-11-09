// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {ISqueezFeeVault} from "./interfaces/ISqueezFeeVault.sol";

/// @notice Accrues protocol + creator fees per token. Creator claims, holder distribution
/// (reward-per-share accumulator, no loops), buyback share for the keeper, treasury share.
/// Not upgradeable. Admin can never touch accrued creator fees.
contract SqueezFeeVault is ISqueezFeeVault, ISqueezEvents {
    error NotImplemented();

    mapping(address token => uint256) public creatorFeesAccrued;
    uint256 public buybackBalance; // 80% of protocol fee
    uint256 public treasuryBalance; // 20% of protocol fee

    function depositFees(address token, address asset, uint256 protocolFee, uint256 creatorFee) external payable {
        token;
        asset;
        protocolFee;
        creatorFee;
        revert NotImplemented(); // TODO: split protocol fee 80/20, route creator fee by FeeDestination
    }

    function claimCreatorFees(address token) external returns (uint256) {
        token;
        revert NotImplemented();
    }
}
