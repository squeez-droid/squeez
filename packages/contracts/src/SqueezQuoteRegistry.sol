// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ISqueezQuoteRegistry} from "./interfaces/ISqueezQuoteRegistry.sol";

/// @notice Admin-managed allowlist of quote assets (HYPE, USDC, Unit, Ondo...) with their HYPE→quote route.
contract SqueezQuoteRegistry is ISqueezQuoteRegistry, Ownable {
    /// @dev Native HYPE is represented by address(0).
    mapping(address => QuoteAsset) private quotes;

    event QuoteSet(address indexed asset, bool active);

    constructor(address admin) Ownable(admin) {
        quotes[address(0)] = QuoteAsset({asset: address(0), decimals: 18, routerPath: "", active: true});
    }

    function setQuote(QuoteAsset calldata q) external onlyOwner {
        quotes[q.asset] = q;
        emit QuoteSet(q.asset, q.active);
    }

    function isActive(address asset) external view returns (bool) {
        return quotes[asset].active;
    }

    function getQuote(address asset) external view returns (QuoteAsset memory) {
        return quotes[asset];
    }
}
