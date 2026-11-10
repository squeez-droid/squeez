// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Events the indexer tracks (see @squeez/shared INDEXED_EVENTS).
interface ISqueezEvents {
    event TokenLaunched(
        address indexed token,
        address indexed curve,
        address indexed creator,
        address quote,
        uint16 creatorFeeBps,
        uint256 launchConfigId,
        address feeRecipient,
        uint8 feeDestinationKind,
        uint16 buybackBps
    );
    event TokenMetadata(address indexed token, string name, string symbol, string metadataURI);
    event ProtectionPolicyPinned(
        address indexed token, address indexed curve, uint256 indexed policyId, bytes32 policyHash
    );
    event ProtectedPurchaseRecorded(
        address indexed token, address indexed buyer, uint256 tokenAmount, uint256 cumulativeAmount
    );
    event CreatorAttested(address indexed token, address indexed creator, bytes32 indexed socialHash, uint256 nonce);
    event CurveTrade(
        address indexed token,
        address indexed trader,
        bool isBuy,
        uint256 hypeAmount,
        uint256 tokenAmount,
        uint256 hypeRaised
    );
    event GraduationThresholdReached(address indexed token, uint256 hypeRaised);
    event GraduationAttempted(address indexed token, address indexed adapter);
    event Graduated(address indexed token, address pool, uint256 quoteAmount, uint256 tokenAmount);
    event PoolSwap(address indexed token, address indexed trader, bool isBuy, uint256 quoteAmount, uint256 tokenAmount);
    event CreatorFeeAccrued(address indexed token, address indexed asset, uint256 amount);
    event ProtectionTaxAccrued(address indexed token, address indexed asset, uint256 amount);
    event CreatorFeeClaimed(address indexed token, address indexed asset, address indexed recipient, uint256 amount);
    event FeeRecipientUpdated(address indexed token, address indexed previousRecipient, address indexed newRecipient);
    event SqueezBurned(uint256 amount);
}
