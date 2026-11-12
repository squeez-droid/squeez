// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SqueezToken} from "./SqueezToken.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {LaunchConfig, LaunchParams} from "./libraries/SqueezTypes.sol";
import {SqueezConstants} from "./libraries/SqueezConstants.sol";
import {SqueezCurveMath} from "./libraries/SqueezCurveMath.sol";

/// @notice One-time-bound CREATE2 boundary that keeps token creation bytecode out of the launch factory.
contract SqueezTokenDeployer {
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

    struct AttestationCheck {
        address verifyingContract;
        address expectedAttester;
        address sender;
        bytes32 evidenceImageHash;
        bytes32 evidenceSocialHash;
        bytes32 expectedNameCommitment;
        bytes32 expectedSymbolCommitment;
        bytes32 expectedMetadataHash;
        CreatorAttestation attestation;
    }

    error Unauthorized();
    error AlreadyBound();

    address public immutable binder;
    address public factory;

    event FactoryBound(address indexed factory);
    event TokenDeployed(address indexed token, address indexed curve, bytes32 indexed salt);

    bytes32 private constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant ATTESTATION_TYPEHASH = keccak256(
        "CreatorAttestation(address creator,bytes32 socialHash,bytes32 nameCommitment,bytes32 symbolCommitment,bytes32 metadataHash,bytes32 imageHash,uint256 nonce,uint256 deadline)"
    );

    constructor(address binder_) {
        if (binder_ == address(0)) revert Unauthorized();
        binder = binder_;
    }

    function bindFactory(address factory_) external {
        if (msg.sender != binder || factory_ == address(0) || factory_.code.length == 0) revert Unauthorized();
        if (factory != address(0)) revert AlreadyBound();
        factory = factory_;
        emit FactoryBound(factory_);
    }

    function deploy(
        bytes32 salt,
        string calldata name,
        string calldata symbol,
        string calldata metadataURI,
        address curve
    ) external returns (SqueezToken token) {
        if (msg.sender != factory || curve == address(0)) revert Unauthorized();
        token = new SqueezToken{salt: salt}(name, symbol, metadataURI, curve);
        emit TokenDeployed(address(token), curve, salt);
    }

    function quoteOpeningBuy(LaunchConfig calldata cfg, uint256 hypeIn, uint16 creatorFeeBps)
        external
        pure
        returns (uint256 tokensOut, uint256 protocolFee, uint256 creatorFee, uint256 sniperTax)
    {
        protocolFee = (hypeIn * SqueezConstants.PROTOCOL_FEE_BPS) / SqueezConstants.BPS;
        creatorFee = (hypeIn * creatorFeeBps) / SqueezConstants.BPS;
        uint256 afterBaseFees = hypeIn - protocolFee - creatorFee;
        sniperTax = (afterBaseFees * cfg.sniperTaxStartBps) / SqueezConstants.BPS;
        uint256 netHype = afterBaseFees - sniperTax;
        tokensOut = SqueezCurveMath.quoteBuy(cfg.virtualHypeReserve, cfg.virtualTokenReserve, 0, netHype);
    }

    /// @return code 0 when valid; 1 params, 2 name, 3 symbol, 4 metadata, 5 creator fee.
    function validateLaunchParams(LaunchParams calldata p) external pure returns (uint8 code) {
        if (p.feeRecipient == address(0)) return 1;
        uint256 nameLength = bytes(p.name).length;
        uint256 symbolLength = bytes(p.symbol).length;
        bytes calldata metadata = bytes(p.metadataURI);
        if (nameLength == 0 || nameLength > 64) return 2;
        if (symbolLength == 0 || symbolLength > 16) return 3;
        if (
            metadata.length <= 7 || metadata.length > 200 || metadata[0] != "i" || metadata[1] != "p"
                || metadata[2] != "f" || metadata[3] != "s" || metadata[4] != ":" || metadata[5] != "/"
                || metadata[6] != "/"
        ) return 4;
        if (p.creatorFeeBps > SqueezConstants.MAX_CREATOR_FEE_BPS) return 5;
        if (p.openingBuyHype == 0 && p.openingBuyMinTokens != 0) return 1;
    }

    /// @dev Keeps EIP-712 validation and signature recovery outside the launch factory's deployment budget.
    function verifyAttestation(bytes calldata encodedCheck, bytes calldata signature) external view returns (bool) {
        AttestationCheck memory check = abi.decode(encodedCheck, (AttestationCheck));
        CreatorAttestation memory a = check.attestation;
        if (
            check.expectedAttester == address(0) || block.timestamp > a.deadline || a.creator != check.sender
                || a.socialHash == bytes32(0) || check.evidenceSocialHash != a.socialHash
                || a.nameCommitment != check.expectedNameCommitment
                || a.symbolCommitment != check.expectedSymbolCommitment || a.metadataHash != check.expectedMetadataHash
                || a.imageHash != check.evidenceImageHash
        ) return false;
        return _recoverAttester(a, check.verifyingContract, signature) == check.expectedAttester;
    }

    function _recoverAttester(CreatorAttestation memory a, address verifyingContract, bytes calldata signature)
        private
        view
        returns (address)
    {
        bytes32 structHash = keccak256(
            abi.encode(
                ATTESTATION_TYPEHASH,
                a.creator,
                a.socialHash,
                a.nameCommitment,
                a.symbolCommitment,
                a.metadataHash,
                a.imageHash,
                a.nonce,
                a.deadline
            )
        );
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256("Squeez Launch Factory"),
                keccak256("1"),
                block.chainid,
                verifyingContract
            )
        );
        return ECDSA.recover(keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)), signature);
    }
}
