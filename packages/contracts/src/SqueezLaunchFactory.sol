// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {BeaconProxy} from "@openzeppelin/contracts/proxy/beacon/BeaconProxy.sol";
import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {ISqueezQuoteRegistry} from "./interfaces/ISqueezQuoteRegistry.sol";
import {ISqueezFeeVault} from "./interfaces/ISqueezFeeVault.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";
import {SqueezCurveMath} from "./libraries/SqueezCurveMath.sol";
import {LaunchConfig, LaunchParams} from "./libraries/SqueezTypes.sol";
import {SqueezToken} from "./SqueezToken.sol";
import {SqueezCurve} from "./SqueezCurve.sol";

/// @notice One launch = one call. Deploys SqueezToken + SqueezCurve, mints 1B to the curve,
/// takes the launch fee and runs the creator's optional opening buy in the same tx.
contract SqueezLaunchFactory is
    Initializable,
    Ownable2StepUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable,
    ISqueezEvents
{
    error InvalidCreatorFee();
    error QuoteNotActive();
    error InsufficientLaunchFee();
    error IncorrectLaunchValue();
    error InvalidLaunchConfig();
    error InvalidLaunchParams();
    error InvalidName();
    error InvalidSymbol();
    error InvalidMetadataURI();
    error TreasuryTransferFailed();
    error ZeroAddress();
    error InvalidAdapter();

    ISqueezQuoteRegistry public quoteRegistry;
    ISqueezFeeVault public feeVault;
    address public treasury;
    address public curveBeacon;

    LaunchConfig[] public launchConfigs; // new configs apply to the next launch only
    uint256 public activeConfigId;
    address public graduationAdapter;

    event LaunchConfigActivated(uint256 indexed configId, LaunchConfig config);
    event GraduationAdapterSet(address indexed previousAdapter, address indexed newAdapter);

    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        ISqueezQuoteRegistry registry,
        ISqueezFeeVault feeVault_,
        address treasury_,
        address curveBeacon_,
        LaunchConfig memory initial
    ) external initializer {
        if (
            admin == address(0) || address(registry) == address(0) || address(feeVault_) == address(0)
                || treasury_ == address(0) || curveBeacon_ == address(0)
        ) revert ZeroAddress();
        __Ownable_init(admin);
        __Ownable2Step_init();
        _validateLaunchConfig(initial);
        quoteRegistry = registry;
        feeVault = feeVault_;
        treasury = treasury_;
        curveBeacon = curveBeacon_;
        launchConfigs.push(initial);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function setLaunchConfig(LaunchConfig calldata cfg) external onlyOwner {
        _validateLaunchConfig(cfg);
        launchConfigs.push(cfg);
        activeConfigId = launchConfigs.length - 1;
        emit LaunchConfigActivated(activeConfigId, cfg);
    }

    /// @notice Sets the chain-specific v4 adapter used by all existing and future curves.
    /// Setting zero pauses graduation without reopening curve trading.
    function setGraduationAdapter(address adapter) external onlyOwner {
        if (adapter != address(0) && adapter.code.length == 0) revert InvalidAdapter();
        address previousAdapter = graduationAdapter;
        graduationAdapter = adapter;
        emit GraduationAdapterSet(previousAdapter, adapter);
    }

    function quoteOpeningBuy(uint256 hypeIn, uint16 creatorFeeBps)
        external
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax)
    {
        if (creatorFeeBps > SqueezConstants.MAX_CREATOR_FEE_BPS) revert InvalidCreatorFee();
        LaunchConfig memory cfg = launchConfigs[activeConfigId];
        protocolFee = (hypeIn * SqueezConstants.PROTOCOL_FEE_BPS) / SqueezConstants.BPS;
        creatorFee = (hypeIn * creatorFeeBps) / SqueezConstants.BPS;
        uint256 afterBaseFees = hypeIn - protocolFee - creatorFee;
        sniperTax = (afterBaseFees * cfg.sniperTaxStartBps) / SqueezConstants.BPS;
        uint256 netHype = afterBaseFees - sniperTax;
        tokensOut = SqueezCurveMath.quoteBuy(cfg.virtualHypeReserve, cfg.virtualTokenReserve, 0, netHype);
    }

    function launch(LaunchParams calldata p) external payable nonReentrant returns (address token, address curve) {
        _validateLaunchParams(p);
        if (!quoteRegistry.isActive(p.quote)) revert QuoteNotActive();
        LaunchConfig memory cfg = launchConfigs[activeConfigId];
        uint256 requiredValue = cfg.launchFeeHype + p.openingBuyHype;
        if (msg.value < requiredValue) revert InsufficientLaunchFee();
        if (msg.value != requiredValue) revert IncorrectLaunchValue();

        SqueezCurve c = SqueezCurve(
            payable(address(
                    new BeaconProxy(
                        curveBeacon,
                        abi.encodeCall(
                            SqueezCurve.initializeCurve,
                            (
                                address(this),
                                msg.sender,
                                p.quote,
                                p.feeRecipient,
                                feeVault,
                                p.creatorFeeBps,
                                cfg,
                                p.feeDestination
                            )
                        )
                    )
                ))
        );
        SqueezToken t = new SqueezToken(p.name, p.symbol, p.metadataURI, address(c));
        c.initializeToken(address(t));
        feeVault.registerCurve(address(t), address(c));

        emit TokenLaunched(
            address(t),
            address(c),
            msg.sender,
            p.quote,
            p.creatorFeeBps,
            activeConfigId,
            p.feeRecipient,
            uint8(p.feeDestination.kind),
            p.feeDestination.buybackBps
        );
        emit TokenMetadata(address(t), p.name, p.symbol, p.metadataURI);

        (bool sent,) = payable(treasury).call{value: cfg.launchFeeHype}("");
        if (!sent) revert TreasuryTransferFailed();
        if (p.openingBuyHype > 0) {
            c.buyFor{value: p.openingBuyHype}(msg.sender, p.openingBuyMinTokens, block.timestamp);
        }

        return (address(t), address(c));
    }

    function _validateLaunchConfig(LaunchConfig memory cfg) private pure {
        if (
            cfg.graduationThresholdHype == 0 || cfg.virtualHypeReserve == 0 || cfg.virtualTokenReserve == 0
                || cfg.sniperTaxStartBps > SqueezConstants.BPS || cfg.maxWalletBps > SqueezConstants.BPS
                || (cfg.sniperTaxStartBps > 0 && cfg.sniperTaxDecaySeconds == 0)
                || (cfg.maxWalletBps > 0 && cfg.maxWalletWindowSeconds == 0)
        ) revert InvalidLaunchConfig();
    }

    function _validateLaunchParams(LaunchParams calldata p) private pure {
        if (p.feeRecipient == address(0)) revert InvalidLaunchParams();
        uint256 nameLength = bytes(p.name).length;
        uint256 symbolLength = bytes(p.symbol).length;
        uint256 metadataLength = bytes(p.metadataURI).length;
        if (nameLength == 0 || nameLength > 64) revert InvalidName();
        if (symbolLength == 0 || symbolLength > 16) revert InvalidSymbol();
        if (metadataLength <= 7 || metadataLength > 200 || !_hasIpfsPrefix(p.metadataURI)) {
            revert InvalidMetadataURI();
        }
        if (p.creatorFeeBps > SqueezConstants.MAX_CREATOR_FEE_BPS) revert InvalidCreatorFee();
        if (p.openingBuyHype == 0 && p.openingBuyMinTokens != 0) revert InvalidLaunchParams();
    }

    function _hasIpfsPrefix(string calldata uri) private pure returns (bool) {
        bytes calldata value = bytes(uri);
        return value.length >= 7 && value[0] == "i" && value[1] == "p" && value[2] == "f" && value[3] == "s"
            && value[4] == ":" && value[5] == "/" && value[6] == "/";
    }
}
