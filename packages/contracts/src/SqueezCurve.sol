// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {LaunchConfig, FeeDestination} from "./libraries/SqueezTypes.sol";

/// @notice HYPE-denominated constant-product curve with virtual reserves, one per token.
/// Takes 1% protocol fee + creator fee on every buy/sell, applies sniper tax and max wallet,
/// and graduates to a full-range Uniswap v4 position when HYPE raised hits the threshold.
contract SqueezCurve is ISqueezEvents {
    error NotImplemented();
    error CurveClosed();
    error Unauthorized();
    error ZeroAddress();

    address public immutable factory;
    address public token;
    address public immutable creator;
    address public immutable quote;
    uint16 public immutable creatorFeeBps;
    uint256 public immutable launchedAt;
    address public feeRecipient;

    LaunchConfig public config;
    FeeDestination public feeDestination;
    uint256 public hypeRaised;
    bool public graduated;

    constructor(
        address creator_,
        address quote_,
        address feeRecipient_,
        uint16 creatorFeeBps_,
        LaunchConfig memory config_,
        FeeDestination memory dest_
    ) {
        if (creator_ == address(0) || feeRecipient_ == address(0)) revert ZeroAddress();
        factory = msg.sender;
        creator = creator_;
        quote = quote_;
        feeRecipient = feeRecipient_;
        creatorFeeBps = creatorFeeBps_;
        config = config_;
        feeDestination = dest_;
        launchedAt = block.timestamp;
    }

    function setFeeRecipient(address newRecipient) external {
        if (msg.sender != creator) revert Unauthorized();
        if (newRecipient == address(0)) revert ZeroAddress();
        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(token, previousRecipient, newRecipient);
    }

    /// @dev Called once by the factory after the token is deployed.
    function initialize(address token_) external {
        if (token_ == address(0)) revert ZeroAddress();
        require(msg.sender == factory && token == address(0), "init");
        token = token_;
    }

    /// @notice Buy with HYPE. Excess above the threshold is refunded and triggers graduation.
    function buy(uint256 minTokensOut) external payable returns (uint256) {
        if (graduated) revert CurveClosed();
        minTokensOut;
        revert NotImplemented(); // TODO: curve math, fees, sniper tax, max wallet, graduation
    }

    function sell(uint256 tokenAmount, uint256 minHypeOut) external returns (uint256) {
        if (graduated) revert CurveClosed();
        tokenAmount;
        minHypeOut;
        revert NotImplemented();
    }

    /// @notice Permissionless fallback if graduation did not fit in the closing buy.
    function graduate() external {
        revert NotImplemented(); // TODO: sweep, swap HYPE→quote, init v4 pool, seed LP, lock
    }

    /// @notice Current sniper tax in bps: linear decay from start to 0 over the decay window.
    function sniperTaxBps() public view returns (uint256) {
        uint256 elapsed = block.timestamp - launchedAt;
        if (elapsed >= config.sniperTaxDecaySeconds) return 0;
        return
            (uint256(config.sniperTaxStartBps) * (config.sniperTaxDecaySeconds - elapsed))
                / config.sniperTaxDecaySeconds;
    }
}
