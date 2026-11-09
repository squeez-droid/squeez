// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {WETH} from "solmate/src/tokens/WETH.sol";

/// @notice Wrapped native HYPE used by the self-hosted v4 periphery on Elysium testnet.
contract SqueezWrappedHype is WETH {}
