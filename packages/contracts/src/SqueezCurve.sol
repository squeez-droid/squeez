// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {ISqueezFeeVault} from "./interfaces/ISqueezFeeVault.sol";
import {ISqueezGraduationAdapter} from "./interfaces/ISqueezGraduationAdapter.sol";
import {ISqueezLaunchFactory} from "./interfaces/ISqueezLaunchFactory.sol";
import {ISqueezIdentityRegistry} from "./interfaces/ISqueezIdentityRegistry.sol";
import {LaunchConfig, FeeDestination} from "./libraries/SqueezTypes.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";
import {SqueezCurveMath} from "./libraries/SqueezCurveMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice HYPE-denominated constant-product curve with virtual reserves, one per token.
/// Takes 1% protocol fee + creator fee on every buy/sell, applies sniper tax and max wallet,
/// and graduates to a full-range Uniswap v4 position when HYPE raised hits the threshold.
contract SqueezCurve is ISqueezEvents, Initializable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct ProtectionPolicyConfig {
        uint256 policyId;
        bytes32 policyHash;
        uint32 protectionWindowSeconds;
        uint16 maxBuyBpsPerTransaction;
        uint16 maxBuyBpsPerAddress;
    }

    error CurveClosed();
    error Unauthorized();
    error ZeroAddress();
    error Expired();
    error SlippageExceeded();
    error MaxWalletExceeded();
    error BuyLimitExceeded();
    error InvalidProtectionPolicy();
    error ThresholdExceeded();
    error TransferFailed();
    error InvalidAmount();
    error ThresholdNotReached();
    error GraduationUnavailable();
    error GraduationInProgress();
    error InvalidGraduationResult();

    address public factory;
    address public token;
    address public creator;
    address public quote;
    ISqueezFeeVault public feeVault;
    uint16 public creatorFeeBps;
    uint256 public launchedAt;
    uint256 public launchedAtBlock;
    address public feeRecipient;

    LaunchConfig public config;
    FeeDestination public feeDestination;
    uint256 public hypeRaised;
    uint256 public sniperTaxAccrued;
    bool public graduated;
    // Appended for Beacon storage compatibility. 0=pending, 1=executing, 2=complete.
    uint8 public graduationState;
    address public graduationPool;
    // Appended for Beacon storage compatibility. Zero policyId preserves the deployed Elysium behavior.
    uint256 public protectionPolicyId;
    bytes32 public protectionPolicyHash;
    uint32 public protectionWindowSeconds;
    uint16 public maxBuyBpsPerTransaction;
    uint16 public maxBuyBpsPerAddress;
    mapping(address buyer => uint256 amount) public purchasedDuringProtection;
    ISqueezIdentityRegistry public identityRegistry;
    uint32 public tickerLockSeconds;
    bool public identityLockTriggered;

    constructor() {
        _disableInitializers();
    }

    function initializeCurve(
        address factory_,
        address creator_,
        address quote_,
        address feeRecipient_,
        ISqueezFeeVault feeVault_,
        uint16 creatorFeeBps_,
        LaunchConfig memory config_,
        FeeDestination memory dest_
    ) external initializer {
        _initializeCurve(factory_, creator_, quote_, feeRecipient_, feeVault_, creatorFeeBps_, config_, dest_);
    }

    function initializeCurveProtected(
        address factory_,
        address creator_,
        address quote_,
        address feeRecipient_,
        ISqueezFeeVault feeVault_,
        uint16 creatorFeeBps_,
        LaunchConfig memory config_,
        FeeDestination memory dest_,
        ProtectionPolicyConfig memory policy_
    ) external initializer {
        if (
            policy_.policyId == 0 || policy_.policyHash == bytes32(0) || policy_.protectionWindowSeconds == 0
                || policy_.protectionWindowSeconds != config_.sniperTaxDecaySeconds
                || policy_.maxBuyBpsPerTransaction == 0 || policy_.maxBuyBpsPerAddress == 0
                || policy_.maxBuyBpsPerTransaction > policy_.maxBuyBpsPerAddress
                || policy_.maxBuyBpsPerAddress > SqueezConstants.BPS
        ) revert InvalidProtectionPolicy();
        _initializeCurve(factory_, creator_, quote_, feeRecipient_, feeVault_, creatorFeeBps_, config_, dest_);
        protectionPolicyId = policy_.policyId;
        protectionPolicyHash = policy_.policyHash;
        protectionWindowSeconds = policy_.protectionWindowSeconds;
        maxBuyBpsPerTransaction = policy_.maxBuyBpsPerTransaction;
        maxBuyBpsPerAddress = policy_.maxBuyBpsPerAddress;
    }

    function _initializeCurve(
        address factory_,
        address creator_,
        address quote_,
        address feeRecipient_,
        ISqueezFeeVault feeVault_,
        uint16 creatorFeeBps_,
        LaunchConfig memory config_,
        FeeDestination memory dest_
    ) private {
        if (
            factory_ == address(0) || creator_ == address(0) || feeRecipient_ == address(0)
                || address(feeVault_) == address(0)
        ) {
            revert ZeroAddress();
        }
        factory = factory_;
        creator = creator_;
        quote = quote_;
        feeVault = feeVault_;
        feeRecipient = feeRecipient_;
        creatorFeeBps = creatorFeeBps_;
        config = config_;
        feeDestination = dest_;
        launchedAt = block.timestamp;
        launchedAtBlock = block.number;
    }

    function setFeeRecipient(address newRecipient) external {
        if (msg.sender != creator) revert Unauthorized();
        if (newRecipient == address(0)) revert ZeroAddress();
        address previousRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(token, previousRecipient, newRecipient);
    }

    /// @dev Called once by the factory after the token is deployed.
    function initializeToken(address token_) external {
        if (token_ == address(0)) revert ZeroAddress();
        require(msg.sender == factory && token == address(0), "init");
        token = token_;
    }

    function initializeIdentity(address registry_, uint32 lockSeconds_) external {
        if (msg.sender != factory || address(identityRegistry) != address(0)) revert Unauthorized();
        if (registry_ == address(0) || registry_.code.length == 0 || lockSeconds_ == 0) revert InvalidAmount();
        identityRegistry = ISqueezIdentityRegistry(registry_);
        tickerLockSeconds = lockSeconds_;
    }

    /// @notice Buy with HYPE. Excess above the threshold is refunded and triggers graduation.
    function quoteBuy(uint256 hypeIn)
        public
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax)
    {
        uint256 taxBps = sniperTaxBps();
        uint256 netHype;
        (protocolFee, creatorFee, sniperTax, netHype) = _feeBreakdown(hypeIn, taxBps);
        uint256 remaining = config.graduationThresholdHype - hypeRaised;
        if (netHype > remaining) {
            uint256 acceptedGross = _maxGrossForNet(hypeIn, remaining, taxBps);
            (protocolFee, creatorFee, sniperTax, netHype) = _feeBreakdown(acceptedGross, taxBps);
        }
        tokensOut = SqueezCurveMath.quoteBuy(config.virtualHypeReserve, config.virtualTokenReserve, hypeRaised, netHype);
    }

    function quoteSell(uint256 tokenAmount)
        public
        view
        returns (uint256 hypeOut, uint256 protocolFee, uint256 creatorFee)
    {
        uint256 grossHype = SqueezCurveMath.quoteSell(
            config.virtualHypeReserve, config.virtualTokenReserve, hypeRaised, tokenAmount
        );
        protocolFee = (grossHype * SqueezConstants.PROTOCOL_FEE_BPS) / SqueezConstants.BPS;
        creatorFee = (grossHype * creatorFeeBps) / SqueezConstants.BPS;
        hypeOut = grossHype - protocolFee - creatorFee;
    }

    function buy(uint256 minTokensOut, uint256 deadline) external payable nonReentrant returns (uint256 tokensOut) {
        if (block.number == launchedAtBlock && msg.sender != creator) revert Unauthorized();
        return _buy(msg.sender, minTokensOut, deadline);
    }

    /// @dev Factory-only opening buy, atomically bundled into launch().
    function buyFor(address recipient, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (msg.sender != factory || recipient != creator) revert Unauthorized();
        return _buy(recipient, minTokensOut, deadline);
    }

    /// @notice Buy on behalf of `recipient`. Intended for routers and aggregators: protection limits, max wallet,
    /// token delivery, refund and the CurveTrade event all apply to `recipient`, not to the calling router.
    function buyTo(address recipient, uint256 minTokensOut, uint256 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (recipient == address(0)) revert InvalidAmount();
        if (block.number == launchedAtBlock && msg.sender != creator) revert Unauthorized();
        return _buy(recipient, minTokensOut, deadline);
    }

    function _buy(address recipient, uint256 minTokensOut, uint256 deadline) private returns (uint256 tokensOut) {
        if (graduated) revert CurveClosed();
        if (block.timestamp > deadline) revert Expired();
        if (msg.value == 0) revert InvalidAmount();
        uint256 taxBps = sniperTaxBps();
        uint256 acceptedGross = msg.value;
        (uint256 protocolFee, uint256 creatorFee, uint256 sniperTax, uint256 netHype) =
            _feeBreakdown(acceptedGross, taxBps);
        uint256 remaining = config.graduationThresholdHype - hypeRaised;
        if (netHype > remaining) {
            acceptedGross = _maxGrossForNet(msg.value, remaining, taxBps);
            (protocolFee, creatorFee, sniperTax, netHype) = _feeBreakdown(acceptedGross, taxBps);
        }
        tokensOut = SqueezCurveMath.quoteBuy(config.virtualHypeReserve, config.virtualTokenReserve, hypeRaised, netHype);
        if (tokensOut < minTokensOut || tokensOut == 0) revert SlippageExceeded();
        uint256 refund = msg.value - acceptedGross;
        _enforceProtection(recipient, tokensOut);
        if (
            block.timestamp < launchedAt + config.maxWalletWindowSeconds
                && IERC20(token).balanceOf(recipient) + tokensOut
                    > (SqueezConstants.TOTAL_SUPPLY * config.maxWalletBps) / SqueezConstants.BPS
        ) revert MaxWalletExceeded();

        hypeRaised += netHype;
        if (
            !identityLockTriggered && address(identityRegistry) != address(0)
                && hypeRaised * 4 >= config.graduationThresholdHype
        ) {
            identityLockTriggered = true;
            identityRegistry.lockIdentity(tickerLockSeconds);
        }
        sniperTaxAccrued += sniperTax;
        if (hypeRaised == config.graduationThresholdHype) {
            graduated = true;
            emit GraduationThresholdReached(token, hypeRaised);
        }
        IERC20(token).safeTransfer(recipient, tokensOut);
        if (sniperTax > 0) {
            feeVault.depositProtectedFees{value: protocolFee + creatorFee + sniperTax}(
                token, address(0), protocolFee, creatorFee, sniperTax
            );
        } else if (protocolFee + creatorFee > 0) {
            feeVault.depositFees{value: protocolFee + creatorFee}(token, address(0), protocolFee, creatorFee);
        }
        if (refund > 0) {
            (bool refunded,) = payable(recipient).call{value: refund}("");
            if (!refunded) revert TransferFailed();
        }
        emit CurveTrade(token, recipient, true, acceptedGross, tokensOut, hypeRaised);
    }

    function _enforceProtection(address recipient, uint256 tokensOut) private {
        if (protectionPolicyId == 0 || block.timestamp >= launchedAt + protectionWindowSeconds) return;
        uint256 cumulative = purchasedDuringProtection[recipient] + tokensOut;
        if (
            tokensOut > (SqueezConstants.TOTAL_SUPPLY * maxBuyBpsPerTransaction) / SqueezConstants.BPS
                || cumulative > (SqueezConstants.TOTAL_SUPPLY * maxBuyBpsPerAddress) / SqueezConstants.BPS
        ) revert BuyLimitExceeded();
        purchasedDuringProtection[recipient] = cumulative;
        emit ProtectedPurchaseRecorded(token, recipient, tokensOut, cumulative);
    }

    function sell(uint256 tokenAmount, uint256 minHypeOut, uint256 deadline)
        external
        nonReentrant
        returns (uint256 hypeOut)
    {
        return _sell(msg.sender, tokenAmount, minHypeOut, deadline);
    }

    /// @notice Sell tokens pulled from the caller (needs allowance) and pay the native proceeds to `recipient`.
    function sellTo(uint256 tokenAmount, uint256 minHypeOut, uint256 deadline, address recipient)
        external
        nonReentrant
        returns (uint256 hypeOut)
    {
        if (recipient == address(0)) revert InvalidAmount();
        return _sell(recipient, tokenAmount, minHypeOut, deadline);
    }

    function _sell(address recipient, uint256 tokenAmount, uint256 minHypeOut, uint256 deadline)
        private
        returns (uint256 hypeOut)
    {
        if (graduated) revert CurveClosed();
        if (block.timestamp > deadline) revert Expired();
        if (tokenAmount == 0) revert InvalidAmount();
        uint256 protocolFee;
        uint256 creatorFee;
        (hypeOut, protocolFee, creatorFee) = quoteSell(tokenAmount);
        if (hypeOut < minHypeOut || hypeOut == 0) revert SlippageExceeded();
        uint256 grossHype = hypeOut + protocolFee + creatorFee;

        hypeRaised -= grossHype;
        IERC20(token).safeTransferFrom(msg.sender, address(this), tokenAmount);
        if (protocolFee + creatorFee > 0) {
            feeVault.depositFees{value: protocolFee + creatorFee}(token, address(0), protocolFee, creatorFee);
        }
        (bool sent,) = payable(recipient).call{value: hypeOut}("");
        if (!sent) revert TransferFailed();
        emit CurveTrade(token, recipient, false, grossHype, tokenAmount, hypeRaised);
    }

    /// @notice Permissionless, idempotent graduation. A failed adapter call reverts all state and can be retried.
    function graduate() external nonReentrant {
        if (!graduated) revert ThresholdNotReached();
        if (graduationState == 2) return;
        if (graduationState == 1) revert GraduationInProgress();

        address adapter = ISqueezLaunchFactory(factory).graduationAdapter();
        if (adapter == address(0) || adapter.code.length == 0) revert GraduationUnavailable();

        uint256 quoteAmount = hypeRaised;
        uint256 tokenAmount = IERC20(token).balanceOf(address(this));
        graduationState = 1;
        emit GraduationAttempted(token, adapter);

        IERC20(token).forceApprove(adapter, tokenAmount);
        (address pool, uint256 quoteUsed, uint256 tokenUsed) =
            ISqueezGraduationAdapter(adapter).graduate{value: quoteAmount}(token, quote, quoteAmount, tokenAmount);
        IERC20(token).forceApprove(adapter, 0);

        if (pool == address(0) || quoteUsed != quoteAmount || tokenUsed != tokenAmount) {
            revert InvalidGraduationResult();
        }
        hypeRaised = 0;
        graduationPool = pool;
        graduationState = 2;
        if (address(identityRegistry) != address(0)) identityRegistry.permanentlyLockSymbol();
        emit Graduated(token, pool, quoteUsed, tokenUsed);
    }

    /// @notice Current sniper tax in bps: linear decay from start to 0 over the decay window.
    function sniperTaxBps() public view returns (uint256) {
        uint256 elapsed = block.timestamp - launchedAt;
        if (elapsed >= config.sniperTaxDecaySeconds) return 0;
        return
            (uint256(config.sniperTaxStartBps) * (config.sniperTaxDecaySeconds - elapsed))
                / config.sniperTaxDecaySeconds;
    }

    function _feeBreakdown(uint256 grossHype, uint256 taxBps)
        private
        view
        returns (uint256 protocolFee, uint256 creatorFee, uint256 sniperTax, uint256 netHype)
    {
        protocolFee = (grossHype * SqueezConstants.PROTOCOL_FEE_BPS) / SqueezConstants.BPS;
        creatorFee = (grossHype * creatorFeeBps) / SqueezConstants.BPS;
        uint256 afterBaseFees = grossHype - protocolFee - creatorFee;
        sniperTax = (afterBaseFees * taxBps) / SqueezConstants.BPS;
        netHype = afterBaseFees - sniperTax;
    }

    function _maxGrossForNet(uint256 grossLimit, uint256 targetNet, uint256 taxBps) private view returns (uint256) {
        uint256 low;
        uint256 high = grossLimit;
        while (low < high) {
            uint256 mid = low + (high - low + 1) / 2;
            (,,, uint256 netHype) = _feeBreakdown(mid, taxBps);
            if (netHype <= targetNet) low = mid;
            else high = mid - 1;
        }
        return low;
    }
}
