// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {SqueezTokenDeployer} from "../src/SqueezTokenDeployer.sol";
import {SqueezTokenUpgradeable} from "../src/SqueezTokenUpgradeable.sol";
import {SqueezCurveProxyDeployer} from "../src/SqueezCurveProxyDeployer.sol";

contract SqueezTokenUpgradeableNext is SqueezTokenUpgradeable {
    function upgradeMarker() external pure returns (bytes32) {
        return keccak256("SQUEEZ_TOKEN_V3_TEST");
    }
}

contract SqueezLaunchDeployersTest is Test {
    SqueezTokenDeployer private tokenDeployer;
    SqueezCurveProxyDeployer private curveDeployer;
    UpgradeableBeacon private tokenBeacon;

    function setUp() public {
        SqueezCurve implementation = new SqueezCurve();
        UpgradeableBeacon beacon = new UpgradeableBeacon(address(implementation), address(this));
        tokenBeacon = new UpgradeableBeacon(address(new SqueezTokenUpgradeable()), address(this));
        tokenDeployer = new SqueezTokenDeployer(address(this), address(tokenBeacon));
        curveDeployer = new SqueezCurveProxyDeployer(address(this), address(beacon));
    }

    function testTokenBeaconUpgradePreservesAddressBalancesAndMetadata() public {
        tokenDeployer.bindFactory(address(this));
        bytes32 imageHash = keccak256("upgrade-image");
        SqueezToken token = tokenDeployer.deploy(
            keccak256("upgrade-token"), "Upgradeable Token", "UP", "ipfs://upgrade-metadata", imageHash, address(0xCAFE)
        );
        address tokenAddress = address(token);
        uint256 supplyBefore = token.totalSupply();
        uint256 curveBalanceBefore = token.balanceOf(address(0xCAFE));

        tokenBeacon.upgradeTo(address(new SqueezTokenUpgradeableNext()));

        assertEq(address(token), tokenAddress);
        assertEq(token.totalSupply(), supplyBefore);
        assertEq(token.balanceOf(address(0xCAFE)), curveBalanceBefore);
        assertEq(SqueezTokenUpgradeable(tokenAddress).tokenURI(), "ipfs://upgrade-metadata");
        assertEq(SqueezTokenUpgradeable(tokenAddress).imageHash(), imageHash);
        assertEq(SqueezTokenUpgradeableNext(tokenAddress).upgradeMarker(), keccak256("SQUEEZ_TOKEN_V3_TEST"));
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
        bytes32 imageHash = keccak256("image");
        SqueezToken token =
            tokenDeployer.deploy(tokenSalt, "Squeez Test", "SQZ", "ipfs://metadata", imageHash, address(0xCAFE));
        assertEq(token.name(), "Squeez Test");
        assertEq(token.symbol(), "SQZ");
        assertEq(token.balanceOf(address(0xCAFE)), token.totalSupply());
        assertEq(SqueezTokenUpgradeable(address(token)).tokenURI(), "ipfs://metadata");
        assertEq(SqueezTokenUpgradeable(address(token)).imageHash(), imageHash);

        address curve = curveDeployer.deploy(keccak256("curve-1"), bytes(""));
        assertTrue(curve.code.length > 0);

        vm.prank(address(0xBEEF));
        vm.expectRevert(SqueezTokenDeployer.Unauthorized.selector);
        tokenDeployer.deploy(keccak256("token-2"), "Squeez Test", "SQZ", "ipfs://metadata", bytes32(0), address(0xCAFE));
    }
}
