// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Curve + protection parameters, locked per token at launch.
struct LaunchConfig {
    uint256 graduationThresholdHype; // [TBD] HYPE raised that closes the curve
    uint256 virtualHypeReserve; // calibrated so the curve sells exactly 5/7 of supply at the threshold
    uint256 virtualTokenReserve;
    uint16 sniperTaxStartBps; // 9900 = 99%, decays linearly to 0
    uint32 sniperTaxDecaySeconds; // timestamp-based (Elysium blocks are 100 ms)
    uint16 maxWalletBps; // 500 = 5% of supply during the early window
    uint32 maxWalletWindowSeconds; // [TBD]
    uint256 launchFeeHype; // [TBD]
}

enum FeeDestinationType {
    Wallet,
    BuybackSplit,
    Holders
}

struct FeeDestination {
    FeeDestinationType kind;
    uint16 buybackBps; // only for BuybackSplit: share of the creator fee used for buyback & vest
}

struct LaunchParams {
    string name;
    string symbol;
    string metadataURI; // IPFS: image, description, socials
    address quote; // must be active in SqueezQuoteRegistry
    address feeRecipient;
    uint16 creatorFeeBps;
    FeeDestination feeDestination;
    uint256 openingBuyHype;
    uint256 openingBuyMinTokens;
}
