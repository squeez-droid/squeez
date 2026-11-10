// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezProtectionPolicyRegistry} from "../src/SqueezProtectionPolicyRegistry.sol";
import {LaunchConfig} from "../src/libraries/SqueezTypes.sol";

abstract contract ProxyTestBase {
    function _deployProtectionPolicyRegistry(address admin) internal returns (SqueezProtectionPolicyRegistry proxy) {
        SqueezProtectionPolicyRegistry implementation = new SqueezProtectionPolicyRegistry();
        proxy = SqueezProtectionPolicyRegistry(
            address(
                new ERC1967Proxy(
                    address(implementation), abi.encodeCall(SqueezProtectionPolicyRegistry.initialize, (admin))
                )
            )
        );
    }

    function _deployRegistry(address admin) internal returns (SqueezQuoteRegistry proxy) {
        SqueezQuoteRegistry implementation = new SqueezQuoteRegistry();
        proxy = SqueezQuoteRegistry(
            address(new ERC1967Proxy(address(implementation), abi.encodeCall(SqueezQuoteRegistry.initialize, (admin))))
        );
    }

    function _deployVault(address admin, address treasury) internal returns (SqueezFeeVault proxy) {
        SqueezFeeVault implementation = new SqueezFeeVault();
        proxy = SqueezFeeVault(
            payable(address(
                    new ERC1967Proxy(
                        address(implementation), abi.encodeCall(SqueezFeeVault.initialize, (admin, treasury))
                    )
                ))
        );
    }

    function _deployCurveBeacon(address admin) internal returns (UpgradeableBeacon beacon) {
        beacon = new UpgradeableBeacon(address(new SqueezCurve()), admin);
    }

    function _deployFactory(
        address admin,
        SqueezQuoteRegistry registry,
        SqueezFeeVault vault,
        address treasury,
        address curveBeacon,
        LaunchConfig memory config
    ) internal returns (SqueezLaunchFactory proxy) {
        SqueezLaunchFactory implementation = new SqueezLaunchFactory();
        proxy = SqueezLaunchFactory(
            payable(address(
                    new ERC1967Proxy(
                        address(implementation),
                        abi.encodeCall(
                            SqueezLaunchFactory.initialize, (admin, registry, vault, treasury, curveBeacon, config)
                        )
                    )
                ))
        );
    }
}
