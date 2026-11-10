// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SqueezIdentityRegistry} from "../src/SqueezIdentityRegistry.sol";

contract IdentityCurveCaller {
    function lock(SqueezIdentityRegistry registry, uint32 duration) external {
        registry.lockIdentity(duration);
    }

    function permanentlyLock(SqueezIdentityRegistry registry) external {
        registry.permanentlyLockSymbol();
    }
}

contract SqueezIdentityRegistryTest is Test {
    SqueezIdentityRegistry internal registry;
    IdentityCurveCaller internal firstCurve;
    IdentityCurveCaller internal secondCurve;
    address internal firstToken = makeAddr("firstToken");
    address internal secondToken = makeAddr("secondToken");
    address internal creator = makeAddr("creator");

    function setUp() public {
        SqueezIdentityRegistry implementation = new SqueezIdentityRegistry();
        registry = SqueezIdentityRegistry(
            address(
                new ERC1967Proxy(address(implementation), abi.encodeCall(implementation.initialize, (address(this))))
            )
        );
        registry.setFactory(address(this));
        firstCurve = new IdentityCurveCaller();
        secondCurve = new IdentityCurveCaller();
    }

    function test_NormalizationIsTrimmedLowercaseAndDeterministic() public view {
        (bytes32 upper, string memory normalized) = registry.symbolCommitment("  SqUeEz  ");
        (bytes32 lower,) = registry.symbolCommitment("squeez");
        assertEq(normalized, "squeez");
        assertEq(upper, lower);
    }

    function test_NormalizationRejectsEmptyControlAndOverlength() public {
        vm.expectRevert(SqueezIdentityRegistry.InvalidIdentity.selector);
        registry.symbolCommitment("   ");
        vm.expectRevert(SqueezIdentityRegistry.InvalidIdentity.selector);
        registry.symbolCommitment("bad\nname");
        vm.expectRevert(SqueezIdentityRegistry.InvalidIdentity.selector);
        registry.symbolCommitment("symbol-is-far-too-long");
    }

    function test_RegistersOriginalThenMarksExactDuplicate() public {
        registry.register(firstToken, creator, address(firstCurve), _identity("Squeez Token", "SQZ"));
        registry.register(secondToken, creator, address(secondCurve), _identity(" squeez token ", "sqz"));

        SqueezIdentityRegistry.Identity memory original = registry.getIdentity(firstToken);
        SqueezIdentityRegistry.Identity memory copy = registry.getIdentity(secondToken);
        assertFalse(original.duplicateName);
        assertFalse(original.duplicateSymbol);
        assertTrue(copy.duplicateName);
        assertTrue(copy.duplicateSymbol);
        assertEq(registry.firstTokenByName(original.nameCommitment), firstToken);
        assertEq(registry.firstTokenBySymbol(original.symbolCommitment), firstToken);
    }

    function test_TemporaryLockBlocksDuplicateThenExpires() public {
        registry.register(firstToken, creator, address(firstCurve), _identity("Squeez Token", "SQZ"));
        firstCurve.lock(registry, 300);
        vm.expectRevert(SqueezIdentityRegistry.ActiveIdentityLock.selector);
        registry.register(secondToken, creator, address(secondCurve), _identity("Squeez Token", "SQZ"));

        vm.warp(block.timestamp + 300);
        registry.register(secondToken, creator, address(secondCurve), _identity("Squeez Token", "SQZ"));
        assertTrue(registry.getIdentity(secondToken).duplicateSymbol);
    }

    function test_PermanentSymbolLockNeverExpires() public {
        registry.register(firstToken, creator, address(firstCurve), _identity("Squeez Token", "SQZ"));
        firstCurve.permanentlyLock(registry);
        vm.warp(block.timestamp + 365 days);
        vm.expectRevert(SqueezIdentityRegistry.ActiveIdentityLock.selector);
        registry.register(secondToken, creator, address(secondCurve), _identity("Other Name", "SQZ"));
    }

    function test_ReservedSqueezTickerCannotLaunch() public {
        registry.reserveSymbol("$SQUEEZ");
        vm.expectRevert(SqueezIdentityRegistry.ActiveIdentityLock.selector);
        registry.register(firstToken, creator, address(firstCurve), _identity("Squeez", " $squeez "));
    }

    function test_OnlyFactoryAndRegisteredCurveCanMutateIdentity() public {
        vm.prank(makeAddr("attacker"));
        vm.expectRevert(SqueezIdentityRegistry.Unauthorized.selector);
        registry.register(firstToken, creator, address(firstCurve), _identity("Squeez Token", "SQZ"));

        vm.expectRevert(SqueezIdentityRegistry.Unauthorized.selector);
        registry.lockIdentity(300);
        vm.expectRevert(SqueezIdentityRegistry.Unauthorized.selector);
        registry.permanentlyLockSymbol();
    }

    function testFuzz_NormalizationIsIdempotent(bytes memory raw) public view {
        uint256 length = bound(raw.length, 1, 64);
        bytes memory printable = new bytes(length);
        for (uint256 i; i < length; ++i) {
            uint8 source = raw.length == 0 ? uint8(i) : uint8(raw[i % raw.length]);
            printable[i] = bytes1(uint8(0x21 + (source % 0x5e)));
        }
        string memory first = registry.normalize(string(printable), 64);
        string memory second = registry.normalize(first, 64);
        assertEq(first, second);
    }

    function testFuzz_TemporaryLockUsesTimestampSeconds(uint32 duration) public {
        duration = uint32(bound(duration, 1, 1 days));
        registry.register(firstToken, creator, address(firstCurve), _identity("Squeez Token", "SQZ"));
        uint256 startedAt = block.timestamp;
        firstCurve.lock(registry, duration);
        bytes32 commitment = registry.getIdentity(firstToken).symbolCommitment;
        (address originalToken, uint64 expiresAt, bool permanent) = registry.symbolLocks(commitment);
        assertEq(originalToken, firstToken);
        assertEq(expiresAt, startedAt + duration);
        assertFalse(permanent);
    }

    function testFuzz_RejectsLockBeyondHardCap(uint32 extra) public {
        extra = uint32(bound(extra, 1, type(uint32).max - 1 days));
        registry.register(firstToken, creator, address(firstCurve), _identity("Squeez Token", "SQZ"));
        vm.expectRevert(SqueezIdentityRegistry.InvalidLock.selector);
        firstCurve.lock(registry, uint32(1 days) + extra);
    }

    function _identity(string memory name, string memory symbol)
        private
        pure
        returns (SqueezIdentityRegistry.IdentityInput memory)
    {
        return SqueezIdentityRegistry.IdentityInput({
            name: name,
            symbol: symbol,
            metadataHash: keccak256("metadata"),
            imageHash: keccak256("image"),
            socialHash: bytes32(0),
            templateVersion: 1,
            tokenCodeHash: keccak256("token-code")
        });
    }
}
