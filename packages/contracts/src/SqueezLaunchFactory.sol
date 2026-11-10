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
import {SqueezProtectionPolicyRegistry} from "./SqueezProtectionPolicyRegistry.sol";
import {ISqueezIdentityRegistry} from "./interfaces/ISqueezIdentityRegistry.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice One launch = one call. Deploys SqueezToken + SqueezCurve, mints 1B to the curve,
/// takes the launch fee and runs the creator's optional opening buy in the same tx.
contract SqueezLaunchFactory is
    Initializable,
    Ownable2StepUpgradeable,
    ReentrancyGuard,
    UUPSUpgradeable,
    ISqueezEvents
{
    struct IdentityEvidenceInput {
        bytes32 imageHash;
        bytes32 socialHash;
        uint32 templateVersion;
    }

    struct CreatorAttestation {
        address creator;
        bytes32 socialHash;
        bytes32 nameCommitment;
        bytes32 symbolCommitment;
        bytes32 metadataHash;
        bytes32 imageHash;
        uint256 nonce;
        uint256 deadline;
    }

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
    error InvalidProtectionPolicy();
    error InvalidAttestation();

    ISqueezQuoteRegistry public quoteRegistry;
    ISqueezFeeVault public feeVault;
    address public treasury;
    address public curveBeacon;

    LaunchConfig[] public launchConfigs; // new configs apply to the next launch only
    uint256 public activeConfigId;
    address public graduationAdapter;
    // Appended for UUPS storage compatibility. Zero registry keeps the deployed Elysium launch path unchanged.
    SqueezProtectionPolicyRegistry public protectionPolicyRegistry;
    uint256 public activeProtectionPolicyId;
    ISqueezIdentityRegistry public identityRegistry;
    uint32 public tickerLockSeconds;
    address public attester;
    mapping(address creator => mapping(uint256 nonce => bool used)) public attestationNonceUsed;

    event LaunchConfigActivated(uint256 indexed configId, LaunchConfig config);
    event GraduationAdapterSet(address indexed previousAdapter, address indexed newAdapter);
    event ProtectionPolicySet(address indexed registry, uint256 indexed policyId, bytes32 indexed policyHash);
    event IdentityRegistrySet(address indexed registry, uint32 tickerLockSeconds);
    event AttesterSet(address indexed attester);

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "CreatorAttestation(address creator,bytes32 socialHash,bytes32 nameCommitment,bytes32 symbolCommitment,bytes32 metadataHash,bytes32 imageHash,uint256 nonce,uint256 deadline)"
    );

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

    function setProtectionPolicy(SqueezProtectionPolicyRegistry registry, uint256 policyId) external onlyOwner {
        if (address(registry) == address(0) || address(registry).code.length == 0 || policyId == 0) {
            revert InvalidProtectionPolicy();
        }
        SqueezProtectionPolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        if (!policy.enabled) revert InvalidProtectionPolicy();
        protectionPolicyRegistry = registry;
        activeProtectionPolicyId = policyId;
        emit ProtectionPolicySet(address(registry), policyId, policy.policyHash);
    }

    function setIdentityRegistry(ISqueezIdentityRegistry registry, uint32 lockSeconds) external onlyOwner {
        if (address(registry) == address(0) || address(registry).code.length == 0 || lockSeconds == 0) {
            revert InvalidProtectionPolicy();
        }
        identityRegistry = registry;
        tickerLockSeconds = lockSeconds;
        emit IdentityRegistrySet(address(registry), lockSeconds);
    }

    function setAttester(address attester_) external onlyOwner {
        if (attester_ == address(0)) revert InvalidAttestation();
        attester = attester_;
        emit AttesterSet(attester_);
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
        return _launch(p, IdentityEvidenceInput({imageHash: bytes32(0), socialHash: bytes32(0), templateVersion: 1}));
    }

    function launchWithIdentity(LaunchParams calldata p, IdentityEvidenceInput calldata evidence)
        external
        payable
        nonReentrant
        returns (address token, address curve)
    {
        if (
            address(identityRegistry) != address(0)
                && (evidence.imageHash == bytes32(0) || evidence.templateVersion == 0)
        ) {
            revert InvalidLaunchParams();
        }
        return _launch(p, evidence);
    }

    function launchWithAttestation(
        LaunchParams calldata p,
        IdentityEvidenceInput calldata evidence,
        CreatorAttestation calldata creatorAttestation,
        bytes calldata signature
    ) external payable nonReentrant returns (address token, address curve) {
        _verifyAttestation(p, evidence, creatorAttestation, signature);
        (token, curve) = _launch(p, evidence);
        emit CreatorAttested(token, msg.sender, creatorAttestation.socialHash, creatorAttestation.nonce);
    }

    function _verifyAttestation(
        LaunchParams calldata p,
        IdentityEvidenceInput calldata evidence,
        CreatorAttestation calldata creatorAttestation,
        bytes calldata signature
    ) private {
        if (address(identityRegistry) == address(0)) {
            revert InvalidAttestation();
        }
        (bytes32 nameCommitment,) = identityRegistry.nameCommitment(p.name);
        (bytes32 symbolCommitment,) = identityRegistry.symbolCommitment(p.symbol);
        if (
            attester == address(0) || block.timestamp > creatorAttestation.deadline
                || creatorAttestation.creator != msg.sender || creatorAttestation.socialHash == bytes32(0)
                || evidence.socialHash != creatorAttestation.socialHash
                || creatorAttestation.nameCommitment != nameCommitment
                || creatorAttestation.symbolCommitment != symbolCommitment
                || creatorAttestation.metadataHash != keccak256(bytes(p.metadataURI))
                || creatorAttestation.imageHash != evidence.imageHash
                || attestationNonceUsed[msg.sender][creatorAttestation.nonce]
        ) revert InvalidAttestation();
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                creatorAttestation.creator,
                creatorAttestation.socialHash,
                creatorAttestation.nameCommitment,
                creatorAttestation.symbolCommitment,
                creatorAttestation.metadataHash,
                creatorAttestation.imageHash,
                creatorAttestation.nonce,
                creatorAttestation.deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("Squeez Launch Factory"), keccak256("1"), block.chainid, address(this)
            )
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        if (ECDSA.recover(digest, signature) != attester) revert InvalidAttestation();
        attestationNonceUsed[msg.sender][creatorAttestation.nonce] = true;
    }

    function _launch(LaunchParams calldata p, IdentityEvidenceInput memory evidence)
        private
        returns (address token, address curve)
    {
        _validateLaunchParams(p);
        if (!quoteRegistry.isActive(p.quote)) revert QuoteNotActive();
        LaunchConfig memory cfg = launchConfigs[activeConfigId];
        uint256 requiredValue = cfg.launchFeeHype + p.openingBuyHype;
        if (msg.value < requiredValue) revert InsufficientLaunchFee();
        if (msg.value != requiredValue) revert IncorrectLaunchValue();

        (bytes memory curveInitializer, uint256 policyId, bytes32 policyHash) = _curveInitializer(p, cfg);
        SqueezCurve c = SqueezCurve(payable(address(new BeaconProxy(curveBeacon, curveInitializer))));
        SqueezToken t = new SqueezToken(p.name, p.symbol, p.metadataURI, address(c));
        c.initializeToken(address(t));
        _registerIdentity(p, evidence, address(t), address(c));
        feeVault.registerCurve(address(t), address(c));

        _emitLaunchEvents(p, address(t), address(c), policyId, policyHash);

        (bool sent,) = payable(treasury).call{value: cfg.launchFeeHype}("");
        if (!sent) revert TreasuryTransferFailed();

        if (p.openingBuyHype > 0) {
            c.buyFor{value: p.openingBuyHype}(msg.sender, p.openingBuyMinTokens, block.timestamp);
        }
        return (address(t), address(c));
    }

    function _registerIdentity(
        LaunchParams calldata p,
        IdentityEvidenceInput memory evidence,
        address token,
        address curve
    ) private {
        if (address(identityRegistry) == address(0)) return;
        identityRegistry.register(
            token,
            msg.sender,
            curve,
            ISqueezIdentityRegistry.IdentityInput({
                name: p.name,
                symbol: p.symbol,
                metadataHash: keccak256(bytes(p.metadataURI)),
                imageHash: evidence.imageHash,
                socialHash: evidence.socialHash,
                templateVersion: evidence.templateVersion,
                tokenCodeHash: token.codehash
            })
        );
        SqueezCurve(payable(curve)).initializeIdentity(address(identityRegistry), tickerLockSeconds);
    }

    function _emitLaunchEvents(
        LaunchParams calldata p,
        address token,
        address curve,
        uint256 policyId,
        bytes32 policyHash
    ) private {
        emit TokenLaunched(
            token,
            curve,
            msg.sender,
            p.quote,
            p.creatorFeeBps,
            activeConfigId,
            p.feeRecipient,
            uint8(p.feeDestination.kind),
            p.feeDestination.buybackBps
        );
        emit TokenMetadata(token, p.name, p.symbol, p.metadataURI);
        if (policyId != 0) emit ProtectionPolicyPinned(token, curve, policyId, policyHash);
    }

    function _curveInitializer(LaunchParams calldata p, LaunchConfig memory cfg)
        private
        view
        returns (bytes memory initializer, uint256 policyId, bytes32 policyHash)
    {
        policyId = activeProtectionPolicyId;
        if (policyId == 0) {
            initializer = abi.encodeCall(
                SqueezCurve.initializeCurve,
                (address(this), msg.sender, p.quote, p.feeRecipient, feeVault, p.creatorFeeBps, cfg, p.feeDestination)
            );
        } else {
            SqueezProtectionPolicyRegistry.Policy memory policy = protectionPolicyRegistry.getPolicy(policyId);
            if (
                !policy.enabled || policy.initialFeeBps != cfg.sniperTaxStartBps
                    || policy.protectionWindowSeconds != cfg.sniperTaxDecaySeconds
            ) revert InvalidProtectionPolicy();
            policyHash = policy.policyHash;
            SqueezCurve.ProtectionPolicyConfig memory curvePolicy = SqueezCurve.ProtectionPolicyConfig({
                policyId: policyId,
                policyHash: policyHash,
                protectionWindowSeconds: policy.protectionWindowSeconds,
                maxBuyBpsPerTransaction: policy.maxBuyBpsPerTransaction,
                maxBuyBpsPerAddress: policy.maxBuyBpsPerAddress
            });
            initializer = abi.encodeCall(
                SqueezCurve.initializeCurveProtected,
                (
                    address(this),
                    msg.sender,
                    p.quote,
                    p.feeRecipient,
                    feeVault,
                    p.creatorFeeBps,
                    cfg,
                    p.feeDestination,
                    curvePolicy
                )
            );
        }
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
