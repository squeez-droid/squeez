// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {SqueezChainConfig} from "../src/SqueezChainConfig.sol";

contract ConfigDependency {}

contract SqueezChainConfigTest is Test {
    SqueezChainConfig internal registry;
    ConfigDependency internal wrappedNative;
    ConfigDependency internal adapter;
    ConfigDependency internal quoteRegistry;
    ConfigDependency internal buybackRoute;

    function setUp() public {
        SqueezChainConfig implementation = new SqueezChainConfig();
        registry = SqueezChainConfig(
            address(
                new ERC1967Proxy(address(implementation), abi.encodeCall(implementation.initialize, (address(this))))
            )
        );
        wrappedNative = new ConfigDependency();
        adapter = new ConfigDependency();
        quoteRegistry = new ConfigDependency();
        buybackRoute = new ConfigDependency();
    }

    function test_PublishesImmutableVersionAndActivatesIt() public {
        SqueezChainConfig.ConfigInput memory input = _config(1);
        bytes32 expectedHash = registry.hashConfig(input);
        assertEq(registry.publishConfig(input, true), expectedHash);
        SqueezChainConfig.Config memory stored = registry.getActiveConfig();
        assertEq(stored.configVersion, 1);
        assertEq(stored.configHash, expectedHash);
        assertEq(stored.chainId, block.chainid);
        assertEq(registry.activeConfigVersion(), 1);
    }

    function test_NewVersionDoesNotMutatePinnedVersion() public {
        SqueezChainConfig.ConfigInput memory first = _config(1);
        registry.publishConfig(first, true);
        SqueezChainConfig.ConfigInput memory second = _config(2);
        second.launchFee = 2 ether;
        registry.publishConfig(second, true);
        assertEq(registry.getConfig(1).launchFee, 1 ether);
        assertEq(registry.getConfig(2).launchFee, 2 ether);
        assertEq(registry.activeConfigVersion(), 2);
    }

    function test_RejectsDuplicateWrongChainAndNonContracts() public {
        SqueezChainConfig.ConfigInput memory input = _config(1);
        registry.publishConfig(input, false);
        vm.expectRevert(SqueezChainConfig.ConfigVersionExists.selector);
        registry.publishConfig(input, false);

        input = _config(2);
        input.chainId = block.chainid + 1;
        vm.expectRevert(SqueezChainConfig.InvalidConfig.selector);
        registry.publishConfig(input, false);

        input = _config(2);
        input.graduationAdapter = makeAddr("not-contract");
        vm.expectRevert(SqueezChainConfig.InvalidConfig.selector);
        registry.publishConfig(input, false);
    }

    function test_OnlyOwnerCanPublishOrActivate() public {
        vm.startPrank(makeAddr("outsider"));
        vm.expectRevert();
        registry.publishConfig(_config(1), true);
        vm.expectRevert();
        registry.setActiveConfigVersion(1);
        vm.stopPrank();
    }

    function _config(uint32 version) private view returns (SqueezChainConfig.ConfigInput memory) {
        return SqueezChainConfig.ConfigInput({
            chainId: block.chainid,
            wrappedNative: address(wrappedNative),
            launchFee: 1 ether,
            graduationThreshold: 20 ether,
            protectionWindowSec: 5,
            avgBlockTimeMs: 100,
            graduationAdapter: address(adapter),
            quoteRegistry: address(quoteRegistry),
            oracleGuard: address(0),
            buybackRoute: address(buybackRoute),
            configVersion: version
        });
    }
}
