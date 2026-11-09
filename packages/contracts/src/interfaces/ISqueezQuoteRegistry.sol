// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ISqueezQuoteRegistry {
    struct QuoteAsset {
        address asset;
        uint8 decimals;
        bytes routerPath; // HYPE → quote swap path used at graduation
        bool active;
    }

    function isActive(address asset) external view returns (bool);
    function getQuote(address asset) external view returns (QuoteAsset memory);
    function getActiveQuotes() external view returns (QuoteAsset[] memory);
}
