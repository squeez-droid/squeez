// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezIdentityRegistry} from "../src/SqueezIdentityRegistry.sol";
import {SqueezTokenUpgradeable} from "../src/SqueezTokenUpgradeable.sol";
import {ISqueezIdentityRegistry} from "../src/interfaces/ISqueezIdentityRegistry.sol";
import {SqueezProtectionPolicyRegistry} from "../src/SqueezProtectionPolicyRegistry.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {FeeDestination, FeeDestinationType, LaunchConfig, LaunchParams} from "../src/libraries/SqueezTypes.sol";
import {ProxyTestBase} from "./ProxyTestBase.sol";

contract SqueezProtectedLaunchTest is Test, ProxyTestBase {
    address internal creator = makeAddr("creator");
    address internal buyer = makeAddr("buyer");
    address internal treasury = makeAddr("treasury");

    SqueezLaunchFactory internal factory;
    SqueezProtectionPolicyRegistry internal policies;
    SqueezIdentityRegistry internal identities;
    uint256 internal policyId;
    bytes32 internal policyHash;
    uint256 internal attesterKey = 0xA77157;

    function setUp() public {
        SqueezQuoteRegistry quotes = _deployRegistry(address(this));
        SqueezFeeVault vault = _deployVault(address(this), treasury);
        UpgradeableBeacon beacon = _deployCurveBeacon(address(this));
        factory = _deployFactory(address(this), quotes, vault, treasury, address(beacon), _config());
        SqueezIdentityRegistry identityImplementation = new SqueezIdentityRegistry();
        identities = SqueezIdentityRegistry(
            address(
                new ERC1967Proxy(
                    address(identityImplementation), abi.encodeCall(SqueezIdentityRegistry.initialize, (address(this)))
                )
            )
        );
        identities.setFactory(address(factory));
        factory.setIdentityRegistry(ISqueezIdentityRegistry(address(identities)), 300);
        policies = _deployProtectionPolicyRegistry(address(this));
        (policyId, policyHash) = policies.createPolicy(_policy());
        factory.setProtectionPolicy(policies, policyId);
        factory.setAttester(vm.addr(attesterKey));
        vm.deal(creator, 1 ether);
        vm.deal(buyer, 1 ether);
    }

    function test_LaunchPinsImmutablePolicySnapshot() public {
        vm.prank(creator);
        (, address curveAddress) = factory.launch{value: 0.001 ether}(_params());
        SqueezCurve curve = SqueezCurve(curveAddress);

        assertEq(curve.protectionPolicyId(), policyId);
        assertEq(curve.protectionPolicyHash(), policyHash);
        assertEq(curve.protectionWindowSeconds(), 300);
        assertEq(curve.maxBuyBpsPerTransaction(), 100);
        assertEq(curve.maxBuyBpsPerAddress(), 500);

        policies.setPolicyEnabled(policyId, false);
        assertEq(curve.protectionPolicyId(), policyId);
        assertEq(curve.protectionPolicyHash(), policyHash);
    }

    function test_LaunchRegistersIdentityAtomically() public {
        vm.prank(creator);
        (address token, address curveAddress) = factory.launch{value: 0.001 ether}(_params());
        SqueezIdentityRegistry.Identity memory identity = identities.getIdentity(token);
        assertEq(identity.creator, creator);
        assertEq(identity.curve, curveAddress);
        assertEq(identities.tokenForCurve(curveAddress), token);
        assertEq(SqueezCurve(curveAddress).tickerLockSeconds(), 300);
    }

    function test_LaunchWithIdentityPinsUploadedImageHash() public {
        bytes32 imageHash = sha256("real-image-bytes");
        SqueezLaunchFactory.IdentityEvidenceInput memory evidence = SqueezLaunchFactory.IdentityEvidenceInput({
            imageHash: imageHash, socialHash: bytes32(0), templateVersion: 1
        });
        vm.prank(creator);
        (address token,) = factory.launchWithIdentity{value: 0.001 ether}(_params(), evidence);
        assertEq(identities.getIdentity(token).imageHash, imageHash);
        assertEq(SqueezTokenUpgradeable(token).imageHash(), imageHash);
        assertEq(SqueezTokenUpgradeable(token).tokenURI(), "ipfs://bafy-protected");
        assertEq(SqueezTokenUpgradeable(token).metadataHash(), keccak256("ipfs://bafy-protected"));
    }

    function test_LaunchWithIdentityRejectsMissingImageEvidence() public {
        SqueezLaunchFactory.IdentityEvidenceInput memory evidence = SqueezLaunchFactory.IdentityEvidenceInput({
            imageHash: bytes32(0), socialHash: bytes32(0), templateVersion: 1
        });
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidLaunchParams.selector);
        factory.launchWithIdentity{value: 0.001 ether}(_params(), evidence);
    }

    function test_LaunchWithAttestationPinsSocialIdentityAndConsumesNonce() public {
        (
            SqueezLaunchFactory.IdentityEvidenceInput memory evidence,
            SqueezLaunchFactory.CreatorAttestation memory attestation,
            bytes memory signature
        ) = _signedAttestation(creator, 41, block.timestamp + 10 minutes);

        vm.prank(creator);
        (address token,) =
            factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, signature);

        assertEq(identities.getIdentity(token).socialHash, attestation.socialHash);
        assertTrue(factory.attestationNonceUsed(creator, 41));
    }

    function test_LaunchWithAttestationRejectsReplay() public {
        (
            SqueezLaunchFactory.IdentityEvidenceInput memory evidence,
            SqueezLaunchFactory.CreatorAttestation memory attestation,
            bytes memory signature
        ) = _signedAttestation(creator, 42, block.timestamp + 10 minutes);
        vm.prank(creator);
        factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, signature);

        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidAttestation.selector);
        factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, signature);
    }

    function test_LaunchWithAttestationRejectsExpiredOrMismatchedEvidence() public {
        (
            SqueezLaunchFactory.IdentityEvidenceInput memory evidence,
            SqueezLaunchFactory.CreatorAttestation memory attestation,
            bytes memory signature
        ) = _signedAttestation(creator, 43, block.timestamp - 1);
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidAttestation.selector);
        factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, signature);

        (evidence, attestation, signature) = _signedAttestation(creator, 44, block.timestamp + 10 minutes);
        evidence.imageHash = sha256("different-image");
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidAttestation.selector);
        factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, signature);
    }

    function test_LaunchWithAttestationRejectsWrongCreatorAndMetadata() public {
        (
            SqueezLaunchFactory.IdentityEvidenceInput memory evidence,
            SqueezLaunchFactory.CreatorAttestation memory attestation,
            bytes memory signature
        ) = _signedAttestation(buyer, 45, block.timestamp + 10 minutes);
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidAttestation.selector);
        factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, signature);

        (evidence, attestation, signature) = _signedAttestation(creator, 46, block.timestamp + 10 minutes);
        LaunchParams memory changed = _params();
        changed.metadataURI = "ipfs://different";
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidAttestation.selector);
        factory.launchWithAttestation{value: 0.001 ether}(changed, evidence, attestation, signature);
    }

    function test_LaunchWithAttestationRejectsSignatureFromAnotherChainOrSigner() public {
        (
            SqueezLaunchFactory.IdentityEvidenceInput memory evidence,
            SqueezLaunchFactory.CreatorAttestation memory attestation,
            bytes memory signature
        ) = _signedAttestation(creator, 47, block.timestamp + 10 minutes);
        vm.chainId(block.chainid + 1);
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidAttestation.selector);
        factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, signature);

        vm.chainId(block.chainid - 1);
        bytes32 badDigest = keccak256("signed-by-untrusted-attester");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBAD, badDigest);
        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidAttestation.selector);
        factory.launchWithAttestation{value: 0.001 ether}(_params(), evidence, attestation, abi.encodePacked(r, s, v));
    }

    function test_TractionAtTwentyFivePercentLocksIdentityOnce() public {
        SqueezCurve curve = _launch();
        vm.warp(block.timestamp + 300);
        vm.prank(buyer);
        curve.buy{value: 0.03 ether}(0, block.timestamp);
        assertTrue(curve.identityLockTriggered());

        vm.prank(creator);
        vm.expectRevert(SqueezIdentityRegistry.ActiveIdentityLock.selector);
        factory.launch{value: 0.001 ether}(_params());
    }

    function test_DisabledPolicyBlocksOnlyNewLaunches() public {
        vm.prank(creator);
        factory.launch{value: 0.001 ether}(_params());
        policies.setPolicyEnabled(policyId, false);

        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidProtectionPolicy.selector);
        factory.launch{value: 0.001 ether}(_params());
    }

    function test_PolicyMustMatchActiveSniperConfiguration() public {
        LaunchConfig memory changed = _config();
        changed.sniperTaxStartBps = 1;
        factory.setLaunchConfig(changed);

        vm.prank(creator);
        vm.expectRevert(SqueezLaunchFactory.InvalidProtectionPolicy.selector);
        factory.launch{value: 0.001 ether}(_params());
    }

    function test_PerTransactionBuyLimitAppliesDuringProtectionWindow() public {
        SqueezCurve curve = _launch();
        vm.prank(buyer);
        vm.expectRevert(SqueezCurve.BuyLimitExceeded.selector);
        curve.buy{value: 0.005 ether}(0, block.timestamp);
    }

    function test_PerAddressBuyLimitAccumulatesAcrossTransactions() public {
        SqueezCurve curve = _launch();
        uint256 purchases;
        while (purchases < 20) {
            vm.prank(buyer);
            try curve.buy{value: 0.0003 ether}(0, block.timestamp) {
                purchases++;
            } catch (bytes memory reason) {
                assertEq(bytes4(reason), SqueezCurve.BuyLimitExceeded.selector);
                assertGt(purchases, 1);
                return;
            }
        }
        fail("cumulative protection limit was not enforced");
    }

    function test_BuyLimitExpiresAfterFiveMinutes() public {
        SqueezCurve curve = _launch();
        vm.warp(block.timestamp + 300);
        vm.prank(buyer);
        curve.buy{value: 0.005 ether}(0, block.timestamp);
    }

    function _launch() private returns (SqueezCurve curve) {
        vm.prank(creator);
        (, address curveAddress) = factory.launch{value: 0.001 ether}(_params());
        curve = SqueezCurve(curveAddress);
        vm.roll(block.number + 1);
    }

    function _policy() private pure returns (SqueezProtectionPolicyRegistry.PolicyInput memory) {
        return SqueezProtectionPolicyRegistry.PolicyInput({
            familyId: keccak256("squeez.protected-launch"),
            version: 1,
            protectionWindowSeconds: 300,
            initialFeeBps: 0,
            maxBuyBpsPerTransaction: 100,
            maxBuyBpsPerAddress: 500
        });
    }

    function _config() private pure returns (LaunchConfig memory) {
        return LaunchConfig({
            graduationThresholdHype: 0.1 ether,
            virtualHypeReserve: 0.04 ether,
            virtualTokenReserve: 1_000_000_000 ether,
            sniperTaxStartBps: 0,
            sniperTaxDecaySeconds: 300,
            maxWalletBps: 10_000,
            maxWalletWindowSeconds: 300,
            launchFeeHype: 0.001 ether
        });
    }

    function _params() private view returns (LaunchParams memory) {
        return LaunchParams({
            name: "Protected Token",
            symbol: "SAFE",
            metadataURI: "ipfs://bafy-protected",
            quote: address(0),
            feeRecipient: creator,
            creatorFeeBps: 0,
            feeDestination: FeeDestination({kind: FeeDestinationType.Wallet, buybackBps: 0}),
            openingBuyHype: 0,
            openingBuyMinTokens: 0
        });
    }

    function _signedAttestation(address attestedCreator, uint256 nonce, uint256 deadline)
        private
        view
        returns (
            SqueezLaunchFactory.IdentityEvidenceInput memory evidence,
            SqueezLaunchFactory.CreatorAttestation memory attestation,
            bytes memory signature
        )
    {
        bytes32 imageHash = sha256("real-image-bytes");
        bytes32 socialHash = keccak256("x-user-id");
        (bytes32 nameHash,) = identities.nameCommitment(_params().name);
        (bytes32 symbolHash,) = identities.symbolCommitment(_params().symbol);
        evidence = SqueezLaunchFactory.IdentityEvidenceInput({
            imageHash: imageHash, socialHash: socialHash, templateVersion: 1
        });
        attestation = SqueezLaunchFactory.CreatorAttestation({
            creator: attestedCreator,
            socialHash: socialHash,
            nameCommitment: nameHash,
            symbolCommitment: symbolHash,
            metadataHash: keccak256(bytes(_params().metadataURI)),
            imageHash: imageHash,
            nonce: nonce,
            deadline: deadline
        });
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("Squeez Launch Factory"),
                keccak256("1"),
                block.chainid,
                address(factory)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "CreatorAttestation(address creator,bytes32 socialHash,bytes32 nameCommitment,bytes32 symbolCommitment,bytes32 metadataHash,bytes32 imageHash,uint256 nonce,uint256 deadline)"
                ),
                attestation.creator,
                attestation.socialHash,
                attestation.nameCommitment,
                attestation.symbolCommitment,
                attestation.metadataHash,
                attestation.imageHash,
                attestation.nonce,
                attestation.deadline
            )
        );
        (uint8 v, bytes32 r, bytes32 s) =
            vm.sign(attesterKey, keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash)));
        signature = abi.encodePacked(r, s, v);
    }
}
