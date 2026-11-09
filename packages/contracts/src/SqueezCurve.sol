// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {ISqueezFeeVault} from "./interfaces/ISqueezFeeVault.sol";
import {LaunchConfig, FeeDestination} from "./libraries/SqueezTypes.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";
import {SqueezCurveMath} from "./libraries/SqueezCurveMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice HYPE-denominated constant-product curve with virtual reserves, one per token.
/// Takes 1% protocol fee + creator fee on every buy/sell, applies sniper tax and max wallet,
/// and graduates to a full-range Uniswap v4 position when HYPE raised hits the threshold.
contract SqueezCurve is ISqueezEvents, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error NotImplemented();
    error CurveClosed();
    error Unauthorized();
    error ZeroAddress();
    error Expired();
    error SlippageExceeded();
    error MaxWalletExceeded();
    error ThresholdExceeded();
    error TransferFailed();
    error InvalidAmount();

    address public immutable factory;
    address public token;
    address public immutable creator;
    address public immutable quote;
    ISqueezFeeVault public immutable feeVault;
    uint16 public immutable creatorFeeBps;
    uint256 public immutable launchedAt;
    uint256 public immutable launchedAtBlock;
    address public feeRecipient;

    LaunchConfig public config;
    FeeDestination public feeDestination;
    uint256 public hypeRaised;
    uint256 public sniperTaxAccrued;
    bool public graduated;

    constructor(
        address creator_,
        address quote_,
        address feeRecipient_,
        ISqueezFeeVault feeVault_,
        uint16 creatorFeeBps_,
        LaunchConfig memory config_,
        FeeDestination memory dest_
    ) {
        if (creator_ == address(0) || feeRecipient_ == address(0) || address(feeVault_) == address(0)) {
            revert ZeroAddress();
        }
        factory = msg.sender;
        creator = creator_;
        quote = quote_;
        feeVault = feeVault_;
        feeRecipient = feeRecipient_;
        creatorFeeBps = creatorFeeBps_;
        config = config_;
        feeDestination = dest_;
        launchedAt = block.timestamp;
        launchedAtBlock = block.number;
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
    function quoteBuy(uint256 hypeIn)
        public
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax)
    {
        protocolFee = (hypeIn * SqueezConstants.PROTOCOL_FEE_BPS) / SqueezConstants.BPS;
        creatorFee = (hypeIn * creatorFeeBps) / SqueezConstants.BPS;
        uint256 afterBaseFees = hypeIn - protocolFee - creatorFee;
        sniperTax = (afterBaseFees * sniperTaxBps()) / SqueezConstants.BPS;
        uint256 netHype = afterBaseFees - sniperTax;
        tokensOut = SqueezCurveMath.quoteBuy(config.virtualHypeReserve, config.virtualTokenReserve, hypeRaised, netHype);
    }

    function quoteSell(uint256 tokenAmount)
        public
        view
        returns (uint256 hypeOut, uint256 protocolFee, uint256 creatorFee)
    {
        uint256 grossHype = SqueezCurveMath.quoteSell(
            config.virtualHypeReserve, config.virtualTokenReserve, hypeRaised, tokenAmount
        );
        protocolFee = (grossHype * SqueezConstants.PROTOCOL_FEE_BPS) / SqueezConstants.BPS;
        creatorFee = (grossHype * creatorFeeBps) / SqueezConstants.BPS;
        hypeOut = grossHype - protocolFee - creatorFee;
    }

    function buy(uint256 minTokensOut, uint256 deadline) external payable nonReentrant returns (uint256 tokensOut) {
        if (block.number == launchedAtBlock && msg.sender != creator) revert Unauthorized();
        return _buy(msg.sender, minTokensOut, deadline);
    }

    /// @dev Factory-only opening buy, atomically bundled into launch().
    function buyFor(address recipient, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (msg.sender != factory || recipient != creator) revert Unauthorized();
        return _buy(recipient, minTokensOut, deadline);
    }

    function _buy(address recipient, uint256 minTokensOut, uint256 deadline) private returns (uint256 tokensOut) {
        if (graduated) revert CurveClosed();
        if (block.timestamp > deadline) revert Expired();
        if (msg.value == 0) revert InvalidAmount();
        uint256 protocolFee;
        uint256 creatorFee;
        uint256 sniperTax;
        (tokensOut, protocolFee, creatorFee, sniperTax) = quoteBuy(msg.value);
        if (tokensOut < minTokensOut || tokensOut == 0) revert SlippageExceeded();
        uint256 netHype = msg.value - protocolFee - creatorFee - sniperTax;
        if (hypeRaised + netHype > config.graduationThresholdHype) revert ThresholdExceeded();
        if (
            block.timestamp < launchedAt + config.maxWalletWindowSeconds
                && IERC20(token).balanceOf(recipient) + tokensOut
                    > (SqueezConstants.TOTAL_SUPPLY * config.maxWalletBps) / SqueezConstants.BPS
        ) revert MaxWalletExceeded();

        hypeRaised += netHype;
        sniperTaxAccrued += sniperTax;
        IERC20(token).safeTransfer(recipient, tokensOut);
        if (protocolFee + creatorFee > 0) {
            feeVault.depositFees{value: protocolFee + creatorFee}(token, address(0), protocolFee, creatorFee);
        }
        emit CurveTrade(token, recipient, true, msg.value, tokensOut, hypeRaised);
    }

    function sell(uint256 tokenAmount, uint256 minHypeOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 hypeOut)
    {
        if (graduated) revert CurveClosed();
        if (block.timestamp > deadline) revert Expired();
        if (tokenAmount == 0) revert InvalidAmount();
        uint256 protocolFee;
        uint256 creatorFee;
        (hypeOut, protocolFee, creatorFee) = quoteSell(tokenAmount);
        if (hypeOut < minHypeOut || hypeOut == 0) revert SlippageExceeded();
        uint256 grossHype = hypeOut + protocolFee + creatorFee;

        hypeRaised -= grossHype;
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        if (protocolFee + creatorFee > 0) {
            feeVault.depositFees{value: protocolFee + creatorFee}(token, address(0), protocolFee, creatorFee);
        }
        (bool sent,) = payable(msg.sender).call{value: hypeOut}("");
        if (!sent) revert TransferFailed();
        emit CurveTrade(token, msg.sender, false, grossHype, tokenAmount, hypeRaised);
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
