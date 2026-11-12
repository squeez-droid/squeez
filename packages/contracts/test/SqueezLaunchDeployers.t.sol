// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {SqueezTokenDeployer} from "../src/SqueezTokenDeployer.sol";
import {SqueezCurveProxyDeployer} from "../src/SqueezCurveProxyDeployer.sol";

contract SqueezLaunchDeployersTest is Test {
    SqueezTokenDeployer private tokenDeployer;
    SqueezCurveProxyDeployer private curveDeployer;

    function setUp() public {
        SqueezCurve implementation = new SqueezCurve();
        UpgradeableBeacon beacon = new UpgradeableBeacon(address(implementation), address(this));
        tokenDeployer = new SqueezTokenDeployer(address(this));
        curveDeployer = new SqueezCurveProxyDeployer(address(this), address(beacon));
    }

    function testBindFactoryIsBinderOnlyAndOneTime() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(SqueezTokenDeployer.Unauthorized.selector);
        tokenDeployer.bindFactory(address(this));

        tokenDeployer.bindFactory(address(this));
        curveDeployer.bindFactory(address(this));

        vm.expectRevert(SqueezTokenDeployer.AlreadyBound.selector);
        tokenDeployer.bindFactory(address(this));
        vm.expectRevert(SqueezCurveProxyDeployer.AlreadyBound.selector);
        curveDeployer.bindFactory(address(this));
    }

    function testOnlyBoundFactoryCanDeployAndCreate2IsDeterministic() public {
        tokenDeployer.bindFactory(address(this));
        curveDeployer.bindFactory(address(this));

        bytes32 tokenSalt = keccak256("token-1");
        SqueezToken token = tokenDeployer.deploy(tokenSalt, "Squeez Test", "SQZ", "ipfs://metadata", address(0xCAFE));
        assertEq(token.name(), "Squeez Test");
        assertEq(token.symbol(), "SQZ");
        assertEq(token.balanceOf(address(0xCAFE)), token.totalSupply());

        address curve = curveDeployer.deploy(keccak256("curve-1"), bytes(""));
        assertTrue(curve.code.length > 0);

        vm.prank(address(0xBEEF));
        vm.expectRevert(SqueezTokenDeployer.Unauthorized.selector);
        tokenDeployer.deploy(keccak256("token-2"), "Squeez Test", "SQZ", "ipfs://metadata", address(0xCAFE));
    }
}
