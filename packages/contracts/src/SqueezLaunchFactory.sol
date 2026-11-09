// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {ISqueezQuoteRegistry} from "./interfaces/ISqueezQuoteRegistry.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";
import {LaunchConfig, LaunchParams} from "./libraries/SqueezTypes.sol";
import {SqueezToken} from "./SqueezToken.sol";
import {SqueezCurve} from "./SqueezCurve.sol";

/// @notice One launch = one call. Deploys SqueezToken + SqueezCurve, mints 1B to the curve,
/// takes the launch fee and runs the creator's optional opening buy in the same tx.
contract SqueezLaunchFactory is Ownable, ReentrancyGuard, ISqueezEvents {
    error InvalidCreatorFee();
    error QuoteNotActive();
    error InsufficientLaunchFee();
    error IncorrectLaunchValue();
    error InvalidLaunchConfig();
    error InvalidLaunchParams();
    error TreasuryTransferFailed();
    error ZeroAddress();

    ISqueezQuoteRegistry public immutable quoteRegistry;
    address public treasury;

    LaunchConfig[] public launchConfigs; // new configs apply to the next launch only
    uint256 public activeConfigId;

    constructor(address admin, ISqueezQuoteRegistry registry, address treasury_, LaunchConfig memory initial)
        Ownable(admin)
    {
        if (admin == address(0) || address(registry) == address(0) || treasury_ == address(0)) revert ZeroAddress();
        _validateLaunchConfig(initial);
        quoteRegistry = registry;
        treasury = treasury_;
        launchConfigs.push(initial);
    }

    function setLaunchConfig(LaunchConfig calldata cfg) external onlyOwner {
        _validateLaunchConfig(cfg);
        launchConfigs.push(cfg);
        activeConfigId = launchConfigs.length - 1;
    }

    function launch(LaunchParams calldata p) external payable nonReentrant returns (address token, address curve) {
        if (
            bytes(p.name).length == 0 || bytes(p.symbol).length == 0 || bytes(p.metadataURI).length == 0
                || p.feeRecipient == address(0)
        ) revert InvalidLaunchParams();
        if (p.creatorFeeBps > SqueezConstants.MAX_CREATOR_FEE_BPS) revert InvalidCreatorFee();
        if (!quoteRegistry.isActive(p.quote)) revert QuoteNotActive();
        LaunchConfig memory cfg = launchConfigs[activeConfigId];
        if (msg.value < cfg.launchFeeHype) revert InsufficientLaunchFee();
        if (msg.value != cfg.launchFeeHype) revert IncorrectLaunchValue();

        SqueezCurve c = new SqueezCurve(msg.sender, p.quote, p.feeRecipient, p.creatorFeeBps, cfg, p.feeDestination);
        SqueezToken t = new SqueezToken(p.name, p.symbol, p.metadataURI, address(c));
        c.initialize(address(t));

        emit TokenLaunched(
            address(t),
            address(c),
            msg.sender,
            p.quote,
            p.creatorFeeBps,
            activeConfigId,
            p.feeRecipient,
            uint8(p.feeDestination.kind),
            p.feeDestination.buybackBps
        );
        emit TokenMetadata(address(t), p.name, p.symbol, p.metadataURI);

        (bool sent,) = payable(treasury).call{value: cfg.launchFeeHype}("");
        if (!sent) revert TreasuryTransferFailed();

        return (address(t), address(c));
    }

    function _validateLaunchConfig(LaunchConfig memory cfg) private pure {
        if (
            cfg.graduationThresholdHype == 0 || cfg.virtualHypeReserve == 0 || cfg.virtualTokenReserve == 0
                || cfg.sniperTaxStartBps > SqueezConstants.BPS || cfg.maxWalletBps > SqueezConstants.BPS
                || (cfg.sniperTaxStartBps > 0 && cfg.sniperTaxDecaySeconds == 0)
                || (cfg.maxWalletBps > 0 && cfg.maxWalletWindowSeconds == 0)
        ) revert InvalidLaunchConfig();
    }
}
