// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";

/// @notice Plain ERC-20: fixed 1B supply minted once to the curve. No mint, tax or blacklist.
contract SqueezToken is ERC20 {
    string public metadataURI;

    constructor(string memory name_, string memory symbol_, string memory metadataURI_, address curve)
        ERC20(name_, symbol_)
    {
        metadataURI = metadataURI_;
        _mint(curve, SqueezConstants.TOTAL_SUPPLY);
    }
}
