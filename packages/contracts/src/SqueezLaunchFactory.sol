// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {Ownable2StepUpgradeable} from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ISqueezEvents} from "./interfaces/ISqueezEvents.sol";
import {ISqueezQuoteRegistry} from "./interfaces/ISqueezQuoteRegistry.sol";
import {ISqueezFeeVault} from "./interfaces/ISqueezFeeVault.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";
import {LaunchConfig, LaunchParams} from "./libraries/SqueezTypes.sol";
import {SqueezCurve} from "./SqueezCurve.sol";
import {SqueezTokenDeployer} from "./SqueezTokenDeployer.sol";
import {SqueezCurveProxyDeployer} from "./SqueezCurveProxyDeployer.sol";
import {SqueezProtectionPolicyRegistry} from "./SqueezProtectionPolicyRegistry.sol";
import {ISqueezIdentityRegistry} from "./interfaces/ISqueezIdentityRegistry.sol";

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
    error InvalidLaunchDeployer();

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
    // Appended for upgrade-safe storage compatibility. Existing proxies must configure both before using this version.
    SqueezTokenDeployer public tokenDeployer;
    SqueezCurveProxyDeployer public curveProxyDeployer;
    mapping(address creator => uint256 nonce) public launchNonce;

    event LaunchConfigActivated(uint256 indexed configId, LaunchConfig config);
    event GraduationAdapterSet(address indexed previousAdapter, address indexed newAdapter);
    event ProtectionPolicySet(address indexed registry, uint256 indexed policyId, bytes32 indexed policyHash);
    event IdentityRegistrySet(address indexed registry, uint32 tickerLockSeconds);
    event AttesterSet(address indexed attester);
    event LaunchDeployersSet(address indexed tokenDeployer, address indexed curveProxyDeployer);

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

    function setLaunchDeployers(SqueezTokenDeployer tokenDeployer_, SqueezCurveProxyDeployer curveProxyDeployer_)
        external
    {
        // Initial installation is permissionless only after both deployers have irreversibly bound themselves to
        // this factory. Replacing an installed pair remains owner-only.
        if (
            (address(tokenDeployer) != address(0) || address(curveProxyDeployer) != address(0)) && msg.sender != owner()
        ) revert InvalidLaunchDeployer();
        if (
            address(tokenDeployer_).code.length == 0 || address(curveProxyDeployer_).code.length == 0
                || tokenDeployer_.factory() != address(this) || curveProxyDeployer_.factory() != address(this)
                || curveProxyDeployer_.beacon() != curveBeacon
        ) revert InvalidLaunchDeployer();
        tokenDeployer = tokenDeployer_;
        curveProxyDeployer = curveProxyDeployer_;
        emit LaunchDeployersSet(address(tokenDeployer_), address(curveProxyDeployer_));
    }

    function quoteOpeningBuy(uint256 hypeIn, uint16 creatorFeeBps)
        external
        view
        returns (uint256 tokensOut, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax)
    {
        if (creatorFeeBps > SqueezConstants.MAX_CREATOR_FEE_BPS) revert InvalidCreatorFee();
        LaunchConfig memory cfg = launchConfigs[activeConfigId];
        return tokenDeployer.quoteOpeningBuy(cfg, hypeIn, creatorFeeBps);
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
            address(tokenDeployer) == address(0) || attestationNonceUsed[msg.sender][creatorAttestation.nonce]
                || !tokenDeployer.verifyAttestation(
                    abi.encode(
                        address(this),
                        attester,
                        msg.sender,
                        evidence.imageHash,
                        evidence.socialHash,
                        nameCommitment,
                        symbolCommitment,
                        keccak256(bytes(p.metadataURI)),
                        creatorAttestation
                    ),
                    signature
                )
        ) {
            revert InvalidAttestation();
        }
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

        SqueezCurve c;
        uint256 policyId;
        bytes32 policyHash;
        (token, c, policyId, policyHash) = _deployLaunchContracts(p, cfg);
        c.initializeToken(token);
        _registerIdentity(p, evidence, token, address(c));
        feeVault.registerCurve(token, address(c));

        _emitLaunchEvents(p, token, address(c), policyId, policyHash);

        (bool sent,) = payable(treasury).call{value: cfg.launchFeeHype}("");
        if (!sent) revert TreasuryTransferFailed();

        if (p.openingBuyHype > 0) {
            c.buyFor{value: p.openingBuyHype}(msg.sender, p.openingBuyMinTokens, block.timestamp);
        }
        return (token, address(c));
    }

    function _deployLaunchContracts(LaunchParams calldata p, LaunchConfig memory cfg)
        private
        returns (address token, SqueezCurve curve, uint256 policyId, bytes32 policyHash)
    {
        if (address(tokenDeployer) == address(0) || address(curveProxyDeployer) == address(0)) {
            revert InvalidLaunchDeployer();
        }
        uint256 nonce = launchNonce[msg.sender]++;
        bytes32 rootSalt = keccak256(abi.encode(block.chainid, address(this), msg.sender, nonce, p.name, p.symbol));
        (curve, policyId, policyHash) = _deployCurve(rootSalt, p, cfg);
        token = address(
            tokenDeployer.deploy(
                keccak256(abi.encode(rootSalt, "SQUEEZ_TOKEN")), p.name, p.symbol, p.metadataURI, address(curve)
            )
        );
    }

    function _deployCurve(bytes32 rootSalt, LaunchParams calldata p, LaunchConfig memory cfg)
        private
        returns (SqueezCurve curve, uint256 policyId, bytes32 policyHash)
    {
        bytes memory initializer;
        bool validPolicy;
        (initializer, policyId, policyHash, validPolicy) = curveProxyDeployer.curveInitializer(
            address(this), msg.sender, p, feeVault, cfg, protectionPolicyRegistry, activeProtectionPolicyId
        );
        if (!validPolicy) revert InvalidProtectionPolicy();
        curve = SqueezCurve(
            payable(curveProxyDeployer.deploy(keccak256(abi.encode(rootSalt, "SQUEEZ_CURVE")), initializer))
        );
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

    function _validateLaunchConfig(LaunchConfig memory cfg) private pure {
        if (
            cfg.graduationThresholdHype == 0 || cfg.virtualHypeReserve == 0 || cfg.virtualTokenReserve == 0
                || cfg.sniperTaxStartBps > SqueezConstants.BPS || cfg.maxWalletBps > SqueezConstants.BPS
                || (cfg.sniperTaxStartBps > 0 && cfg.sniperTaxDecaySeconds == 0)
                || (cfg.maxWalletBps > 0 && cfg.maxWalletWindowSeconds == 0)
        ) revert InvalidLaunchConfig();
    }

    function _validateLaunchParams(LaunchParams calldata p) private view {
        uint8 code = tokenDeployer.validateLaunchParams(p);
        if (code == 0) return;
        if (code == 2) revert InvalidName();
        if (code == 3) revert InvalidSymbol();
        if (code == 4) revert InvalidMetadataURI();
        if (code == 5) revert InvalidCreatorFee();
        revert InvalidLaunchParams();
    }
}
