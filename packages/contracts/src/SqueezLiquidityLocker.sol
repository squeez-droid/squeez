// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface ILockerFeeVault {
    function curveForToken(address token) external view returns (address);
}

interface ILockerCurve {
    function factory() external view returns (address);
}

interface ILockerFactory {
    function graduationAdapter() external view returns (address);
}

/// @notice Permanently holds each graduated v4 LP position and the residual locked token supply.
/// There is intentionally no owner and no withdrawal or arbitrary-call path.
contract SqueezLiquidityLocker is IERC721Receiver {
    using SafeERC20 for IERC20;

    error Unauthorized();
    error InvalidLock();
    error AlreadyLocked();
    error ZeroAddress();

    ILockerFeeVault public immutable feeVault;
    IERC721 public immutable positionManager;

    mapping(address token => uint256 positionId) public positionForToken;
    mapping(address token => uint256 amount) public lockedTokenAmount;
    mapping(address token => uint256 amount) public lockedNativeAmount;
    mapping(address token => bool locked) public isLocked;
    mapping(uint256 positionId => address token) public tokenForPosition;

    event PositionLocked(address indexed token, address indexed curve, uint256 positionId, uint256 lockedTokens);

    constructor(ILockerFeeVault feeVault_, IERC721 positionManager_) {
        if (address(feeVault_) == address(0) || address(positionManager_) == address(0)) revert ZeroAddress();
        feeVault = feeVault_;
        positionManager = positionManager_;
    }

    function lock(address token, uint256 positionId, uint256 lockedTokens) external payable {
        if (token == address(0)) revert InvalidLock();
        address curve = feeVault.curveForToken(token);
        if (curve == address(0)) revert Unauthorized();
        if (msg.sender != curve && !_isCurrentAdapter(curve, msg.sender)) revert Unauthorized();
        if (isLocked[token] || tokenForPosition[positionId] != address(0)) revert AlreadyLocked();

        isLocked[token] = true;
        positionForToken[token] = positionId;
        lockedTokenAmount[token] = lockedTokens;
        lockedNativeAmount[token] = msg.value;
        tokenForPosition[positionId] = token;

        if (lockedTokens > 0) IERC20(token).safeTransferFrom(msg.sender, address(this), lockedTokens);
        positionManager.safeTransferFrom(msg.sender, address(this), positionId);
        emit PositionLocked(token, curve, positionId, lockedTokens);
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(positionManager)) revert Unauthorized();
        return IERC721Receiver.onERC721Received.selector;
    }

    function _isCurrentAdapter(address curve, address candidate) private view returns (bool) {
        try ILockerCurve(curve).factory() returns (address factory) {
            if (factory.code.length == 0) return false;
            try ILockerFactory(factory).graduationAdapter() returns (address adapter) {
                return adapter == candidate;
            } catch {
                return false;
            }
        } catch {
            return false;
        }
    }
}
