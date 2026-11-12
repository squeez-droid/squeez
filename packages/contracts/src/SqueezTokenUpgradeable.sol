// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";

/// @notice Beacon implementation used by tokens created by the current launch template.
/// @dev Metadata is content-addressed on IPFS and anchored by URI/hash in proxy storage.
contract SqueezTokenUpgradeable is Initializable, ERC20Upgradeable {
    string public metadataURI;
    bytes32 public metadataHash;
    bytes32 public imageHash;

    constructor() {
        _disableInitializers();
    }

    function initialize(
        string calldata name_,
        string calldata symbol_,
        string calldata metadataURI_,
        bytes32 imageHash_,
        address curve
    ) external initializer {
        require(curve != address(0), "zero curve");
        __ERC20_init(name_, symbol_);
        metadataURI = metadataURI_;
        metadataHash = keccak256(bytes(metadataURI_));
        imageHash = imageHash_;
        _mint(curve, SqueezConstants.TOTAL_SUPPLY);
    }

    /// @notice ERC-1046-compatible alias for third-party metadata discovery.
    function tokenURI() external view returns (string memory) {
        return metadataURI;
    }

    function metadataVersion() external pure returns (uint256) {
        return 2;
    }
}
