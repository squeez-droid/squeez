// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SqueezProtectionPolicyRegistry} from "../src/SqueezProtectionPolicyRegistry.sol";

contract SqueezProtectionPolicyRegistryV2 is SqueezProtectionPolicyRegistry {
    function versionMarker() external pure returns (uint256) {
        return 2;
    }
}

contract SqueezProtectionPolicyRegistryTest is Test {
    SqueezProtectionPolicyRegistry internal registry;
    address internal outsider = makeAddr("outsider");

    function setUp() public {
        SqueezProtectionPolicyRegistry implementation = new SqueezProtectionPolicyRegistry();
        registry = SqueezProtectionPolicyRegistry(
            address(
                new ERC1967Proxy(address(implementation), abi.encodeCall(implementation.initialize, (address(this))))
            )
        );
    }

    function test_CreatesCanonicalVersionedPolicy() public {
        SqueezProtectionPolicyRegistry.PolicyInput memory input = _defaultPolicy();
        bytes32 expectedHash = registry.hashPolicy(input);
        (uint256 policyId, bytes32 policyHash) = registry.createPolicy(input);
        SqueezProtectionPolicyRegistry.Policy memory policy = registry.getPolicy(policyId);

        assertEq(policyId, 1);
        assertEq(policyHash, expectedHash);
        assertEq(policy.policyHash, expectedHash);
        assertEq(policy.familyId, keccak256("squeez.protected-launch"));
        assertEq(policy.version, 1);
        assertEq(policy.protectionWindowSeconds, 5);
        assertEq(policy.initialFeeBps, 9_900);
        assertEq(policy.maxBuyBpsPerTransaction, 100);
        assertEq(policy.maxBuyBpsPerAddress, 500);
        assertTrue(policy.enabled);
        assertEq(registry.policyByFamilyVersion(policy.familyId, 1), policyId);
    }

    function test_PoliciesAreAppendOnlyAndVersionsUnique() public {
        SqueezProtectionPolicyRegistry.PolicyInput memory first = _defaultPolicy();
        registry.createPolicy(first);
        vm.expectRevert(SqueezProtectionPolicyRegistry.PolicyVersionExists.selector);
        registry.createPolicy(first);

        first.version = 2;
        (uint256 secondId,) = registry.createPolicy(first);
        assertEq(secondId, 2);
        assertEq(registry.getPolicy(1).version, 1);
        assertEq(registry.getPolicy(2).version, 2);
    }

    function test_DisablingOnlyAffectsNewLaunchEligibility() public {
        (uint256 policyId,) = registry.createPolicy(_defaultPolicy());
        bytes32 originalHash = registry.getPolicy(policyId).policyHash;
        registry.setPolicyEnabled(policyId, false);
        SqueezProtectionPolicyRegistry.Policy memory policy = registry.getPolicy(policyId);
        assertFalse(policy.enabled);
        assertEq(policy.policyHash, originalHash);
    }

    function test_RejectsPoliciesOutsideHardCaps() public {
        SqueezProtectionPolicyRegistry.PolicyInput memory input = _defaultPolicy();
        input.initialFeeBps = 9_901;
        vm.expectRevert(SqueezProtectionPolicyRegistry.InvalidPolicy.selector);
        registry.createPolicy(input);

        input = _defaultPolicy();
        input.maxBuyBpsPerTransaction = 501;
        input.maxBuyBpsPerAddress = 500;
        vm.expectRevert(SqueezProtectionPolicyRegistry.InvalidPolicy.selector);
        registry.createPolicy(input);

        input = _defaultPolicy();
        input.protectionWindowSeconds = 1 days + 1;
        vm.expectRevert(SqueezProtectionPolicyRegistry.InvalidPolicy.selector);
        registry.createPolicy(input);
    }

    function test_OnlyOwnerCanCreateDisableOrUpgrade() public {
        SqueezProtectionPolicyRegistryV2 next = new SqueezProtectionPolicyRegistryV2();
        vm.startPrank(outsider);
        vm.expectRevert();
        registry.createPolicy(_defaultPolicy());
        vm.expectRevert();
        registry.setPolicyEnabled(1, false);
        vm.expectRevert();
        registry.upgradeToAndCall(address(next), "");
        vm.stopPrank();
    }

    function test_UpgradePreservesPolicies() public {
        (uint256 policyId, bytes32 policyHash) = registry.createPolicy(_defaultPolicy());
        SqueezProtectionPolicyRegistryV2 next = new SqueezProtectionPolicyRegistryV2();
        registry.upgradeToAndCall(address(next), "");
        assertEq(SqueezProtectionPolicyRegistryV2(address(registry)).versionMarker(), 2);
        assertEq(registry.getPolicy(policyId).policyHash, policyHash);
    }

    function test_ImplementationCannotBeInitialized() public {
        SqueezProtectionPolicyRegistry implementation = new SqueezProtectionPolicyRegistry();
        vm.expectRevert();
        implementation.initialize(address(this));
    }

    function _defaultPolicy() private pure returns (SqueezProtectionPolicyRegistry.PolicyInput memory) {
        return SqueezProtectionPolicyRegistry.PolicyInput({
            familyId: keccak256("squeez.protected-launch"),
            version: 1,
            protectionWindowSeconds: 5,
            initialFeeBps: 9_900,
            maxBuyBpsPerTransaction: 100,
            maxBuyBpsPerAddress: 500
        });
    }
}
