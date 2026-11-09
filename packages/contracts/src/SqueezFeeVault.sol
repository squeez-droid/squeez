// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {ISqueezFeeVault} from "./interfaces/ISqueezFeeVault.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";

interface IFeeRecipientSource {
    function feeRecipient() external view returns (address);
    function factory() external view returns (address);
    function token() external view returns (address);
}

/// @notice Solvent accounting boundary for protocol and creator fees.
/// Creator liabilities cannot be withdrawn by the owner and are paid only to the curve's current fee recipient.
contract SqueezFeeVault is
    ISqueezFeeVault,
    ISqueezEvents,
    Initializable,
    Ownable2StepUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    error Unauthorized();
    error InvalidRegistration();
    error InvalidDeposit();
    error NothingToClaim();
    error TransferFailed();
    error ZeroAddress();

    address public treasury;
    mapping(address token => address curve) public curveForToken;
    mapping(address token => mapping(address asset => uint256)) public creatorFeesAccrued;
    mapping(address asset => uint256) public buybackBalance;
    mapping(address asset => uint256) public treasuryBalance;
    // Append-only upgrade storage: never insert fields above this line.
    address public hook;
    address public buybackOperator;
    mapping(address asset => uint256) public buybackWithdrawalCap;

    event CurveRegistered(address indexed token, address indexed curve);
    event HookSet(address indexed hook);
    event BuybackOperatorSet(address indexed operator);
    event BuybackWithdrawalCapSet(address indexed asset, uint256 cap);
    event BuybackWithdrawn(address indexed asset, address indexed recipient, uint256 amount);
    event ProtocolFeeAccrued(
        address indexed token, address indexed asset, uint256 buybackAmount, uint256 treasuryAmount
    );

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address treasury_) external initializer {
        if (admin == address(0) || treasury_ == address(0)) revert ZeroAddress();
        __Ownable_init(admin);
        __Ownable2Step_init();
        treasury = treasury_;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setHook(address hook_) external onlyOwner {
        hook = hook_;
        emit HookSet(hook_);
    }

    function setBuybackOperator(address operator) external onlyOwner {
        buybackOperator = operator;
        emit BuybackOperatorSet(operator);
    }

    function setBuybackWithdrawalCap(address asset, uint256 cap) external onlyOwner {
        buybackWithdrawalCap[asset] = cap;
        emit BuybackWithdrawalCapSet(asset, cap);
    }

    function registerCurve(address token, address curve) external {
        if (token == address(0) || curve == address(0) || curveForToken[token] != address(0)) {
            revert InvalidRegistration();
        }
        if (IFeeRecipientSource(curve).factory() != msg.sender || IFeeRecipientSource(curve).token() != token) {
            revert Unauthorized();
        }
        curveForToken[token] = curve;
        emit CurveRegistered(token, curve);
    }

    function depositFees(address token, address asset, uint256 protocolFee, uint256 creatorFee) external payable {
        address registeredCurve = curveForToken[token];
        if (registeredCurve == address(0) || (msg.sender != registeredCurve && msg.sender != hook)) {
            revert Unauthorized();
        }
        uint256 total = protocolFee + creatorFee;
        if (total == 0) revert InvalidDeposit();
        if (asset == address(0)) {
            if (msg.value != total) revert InvalidDeposit();
        } else {
            if (msg.value != 0) revert InvalidDeposit();
            IERC20(asset).safeTransferFrom(msg.sender, address(this), total);
        }

        uint256 buybackAmount = (protocolFee * SqueezConstants.BURN_BPS_OF_PROTOCOL) / SqueezConstants.BPS;
        uint256 treasuryAmount = protocolFee - buybackAmount;
        buybackBalance[asset] += buybackAmount;
        treasuryBalance[asset] += treasuryAmount;
        creatorFeesAccrued[token][asset] += creatorFee;

        emit ProtocolFeeAccrued(token, asset, buybackAmount, treasuryAmount);
        if (creatorFee > 0) emit CreatorFeeAccrued(token, asset, creatorFee);
    }

    function claimCreatorFees(address token, address asset) external nonReentrant returns (uint256 amount) {
        address curve = curveForToken[token];
        if (curve == address(0) || msg.sender != IFeeRecipientSource(curve).feeRecipient()) revert Unauthorized();
        amount = creatorFeesAccrued[token][asset];
        if (amount == 0) revert NothingToClaim();
        creatorFeesAccrued[token][asset] = 0;
        _transfer(asset, msg.sender, amount);
        emit CreatorFeeClaimed(token, asset, msg.sender, amount);
    }

    function withdrawTreasury(address asset) external nonReentrant returns (uint256 amount) {
        if (msg.sender != treasury) revert Unauthorized();
        amount = treasuryBalance[asset];
        if (amount == 0) revert NothingToClaim();
        treasuryBalance[asset] = 0;
        _transfer(asset, treasury, amount);
    }

    function withdrawBuyback(address asset, address recipient, uint256 amount) external nonReentrant {
        if (msg.sender != buybackOperator) revert Unauthorized();
        uint256 cap = buybackWithdrawalCap[asset];
        if (recipient == address(0)) revert ZeroAddress();
        if (amount == 0 || cap == 0 || amount > cap || amount > buybackBalance[asset]) revert InvalidDeposit();
        buybackBalance[asset] -= amount;
        _transfer(asset, recipient, amount);
        emit BuybackWithdrawn(asset, recipient, amount);
    }

    function _transfer(address asset, address recipient, uint256 amount) private {
        if (asset == address(0)) {
            (bool sent,) = payable(recipient).call{value: amount}("");
            if (!sent) revert TransferFailed();
        } else {
            IERC20(asset).safeTransfer(recipient, amount);
        }
    }
}
