// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ISqueezQuoteRegistry} from "./interfaces/ISqueezQuoteRegistry.sol";

/// @notice Admin-managed allowlist of quote assets (HYPE, USDC, Unit, Ondo...) with their HYPE→quote route.
contract SqueezQuoteRegistry is ISqueezQuoteRegistry, Initializable, Ownable2StepUpgradeable, UUPSUpgradeable {
    error InvalidQuote();

    /// @dev Native HYPE is represented by address(0).
    mapping(address => QuoteAsset) private quotes;
    address[] private quoteAssets;
    mapping(address asset => bool) private knownAsset;

    event QuoteSet(address indexed asset, uint8 decimals, bytes routerPath, bool active);

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin) external initializer {
        __Ownable_init(admin);
        __Ownable2Step_init();
        quotes[address(0)] = QuoteAsset({asset: address(0), decimals: 18, routerPath: "", active: true});
        quoteAssets.push(address(0));
        knownAsset[address(0)] = true;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setQuote(QuoteAsset calldata q) external onlyOwner {
        if (q.decimals == 0 || q.decimals > 18) revert InvalidQuote();
        if (q.asset == address(0)) {
            if (q.decimals != 18 || q.routerPath.length != 0 || !q.active) revert InvalidQuote();
        } else {
            if (q.asset.code.length == 0 || (q.active && q.routerPath.length == 0)) revert InvalidQuote();
        }
        if (!knownAsset[q.asset]) {
            knownAsset[q.asset] = true;
            quoteAssets.push(q.asset);
        }
        quotes[q.asset] = q;
        emit QuoteSet(q.asset, q.decimals, q.routerPath, q.active);
    }

    function isActive(address asset) external view returns (bool) {
        return quotes[asset].active;
    }

    function getQuote(address asset) external view returns (QuoteAsset memory) {
        return quotes[asset];
    }

    function getActiveQuotes() external view returns (QuoteAsset[] memory active) {
        uint256 count = 0;
        for (uint256 i; i < quoteAssets.length; ++i) {
            if (quotes[quoteAssets[i]].active) ++count;
        }
        active = new QuoteAsset[](count);
        uint256 cursor = 0;
        for (uint256 i; i < quoteAssets.length; ++i) {
            QuoteAsset memory item = quotes[quoteAssets[i]];
            if (item.active) active[cursor++] = item;
        }
    }
}
