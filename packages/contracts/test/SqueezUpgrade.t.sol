// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {UpgradeableBeacon} from "@openzeppelin/contracts/proxy/beacon/UpgradeableBeacon.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SqueezLaunchFactory} from "../src/SqueezLaunchFactory.sol";
import {SqueezFeeVault} from "../src/SqueezFeeVault.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {SqueezCurve} from "../src/SqueezCurve.sol";
import {SqueezToken} from "../src/SqueezToken.sol";
import {FeeDestination, FeeDestinationType, LaunchConfig, LaunchParams} from "../src/libraries/SqueezTypes.sol";
import {ProxyTestBase} from "./ProxyTestBase.sol";

contract LegacySqueezFeeVault is Initializable, OwnableUpgradeable, ReentrancyGuard, UUPSUpgradeable {
    address public treasury;
    mapping(address token => address curve) public curveForToken;
    mapping(address token => mapping(address asset => uint256)) public creatorFeesAccrued;
    mapping(address asset => uint256) public buybackBalance;
    mapping(address asset => uint256) public treasuryBalance;

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address treasury_) external initializer {
        __Ownable_init(admin);
        treasury = treasury_;
    }

    function seed(address token, address curve, address asset) external onlyOwner {
        curveForToken[token] = curve;
        creatorFeesAccrued[token][asset] = 2 ether;
        buybackBalance[asset] = 0.8 ether;
        treasuryBalance[asset] = 0.2 ether;
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}
}

contract SqueezLaunchFactoryV2 is SqueezLaunchFactory {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract SqueezFeeVaultV2 is SqueezFeeVault {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract SqueezQuoteRegistryV2 is SqueezQuoteRegistry {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract SqueezCurveV2 is SqueezCurve {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract SqueezUpgradeTest is Test, ProxyTestBase {
    bytes32 private constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
    bytes32 private constant BEACON_SLOT = 0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50;
    address internal treasury = makeAddr("treasury");
    SqueezQuoteRegistry internal registry;
    SqueezFeeVault internal vault;
    SqueezLaunchFactory internal factory;
    UpgradeableBeacon internal beacon;

    function setUp() public {
        registry = _deployRegistry(address(this));
        vault = _deployVault(address(this), treasury);
        beacon = _deployCurveBeacon(address(this));
        factory = _deployFactory(address(this), registry, vault, treasury, address(beacon), _config());
    }

    function test_UUPSUpgradesKeepProxyAddressesAndState() public {
        address registryProxy = address(registry);
        address vaultProxy = address(vault);
        address factoryProxy = address(factory);
        factory.setGraduationAdapter(address(beacon));

        registry.upgradeToAndCall(address(new SqueezQuoteRegistryV2()), "");
        vault.upgradeToAndCall(address(new SqueezFeeVaultV2()), "");
        factory.upgradeToAndCall(address(new SqueezLaunchFactoryV2()), "");

        assertEq(address(registry), registryProxy);
        assertEq(address(vault), vaultProxy);
        assertEq(address(factory), factoryProxy);
        assertEq(SqueezQuoteRegistryV2(registryProxy).version(), 2);
        assertEq(SqueezFeeVaultV2(payable(vaultProxy)).version(), 2);
        assertEq(SqueezLaunchFactoryV2(payable(factoryProxy)).version(), 2);
        assertTrue(registry.isActive(address(0)));
        assertEq(vault.treasury(), treasury);
        assertEq(address(factory.quoteRegistry()), registryProxy);
        assertEq(address(factory.feeVault()), vaultProxy);
        assertEq(factory.curveBeacon(), address(beacon));
        assertEq(factory.activeConfigId(), 0);
        assertEq(factory.graduationAdapter(), address(beacon));
    }

    function test_NonOwnerCannotUpgradeCoreProxy() public {
        address attacker = makeAddr("attacker");
        SqueezLaunchFactoryV2 nextImplementation = new SqueezLaunchFactoryV2();
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        factory.upgradeToAndCall(address(nextImplementation), "");
    }

    function test_ImplementationsCannotBeInitializedDirectly() public {
        SqueezQuoteRegistry registryImplementation = new SqueezQuoteRegistry();
        SqueezFeeVault vaultImplementation = new SqueezFeeVault();
        SqueezLaunchFactory factoryImplementation = new SqueezLaunchFactory();
        SqueezCurve curveImplementation = new SqueezCurve();

        vm.expectRevert();
        registryImplementation.initialize(address(this));

        vm.expectRevert();
        vaultImplementation.initialize(address(this), treasury);

        vm.expectRevert();
        factoryImplementation.initialize(address(this), registry, vault, treasury, address(beacon), _config());

        vm.expectRevert();
        curveImplementation.initializeCurve(
            address(factory),
            address(this),
            address(0),
            address(this),
            vault,
            100,
            _config(),
            FeeDestination({kind: FeeDestinationType.Wallet, buybackBps: 0})
        );
    }

    function test_ProxyInitializersCannotRunTwice() public {
        vm.expectRevert();
        registry.initialize(address(this));

        vm.expectRevert();
        vault.initialize(address(this), treasury);

        vm.expectRevert();
        factory.initialize(address(this), registry, vault, treasury, address(beacon), _config());
    }

    function test_DeploymentWiringAndERC1967Slots() public view {
        assertEq(registry.owner(), address(this));
        assertEq(vault.owner(), address(this));
        assertEq(factory.owner(), address(this));
        assertEq(beacon.owner(), address(this));
        assertEq(address(factory.quoteRegistry()), address(registry));
        assertEq(address(factory.feeVault()), address(vault));
        assertEq(factory.treasury(), treasury);
        assertEq(factory.curveBeacon(), address(beacon));

        address registryImplementation = address(uint160(uint256(vm.load(address(registry), IMPLEMENTATION_SLOT))));
        address vaultImplementation = address(uint160(uint256(vm.load(address(vault), IMPLEMENTATION_SLOT))));
        address factoryImplementation = address(uint160(uint256(vm.load(address(factory), IMPLEMENTATION_SLOT))));
        assertGt(registryImplementation.code.length, 0);
        assertGt(vaultImplementation.code.length, 0);
        assertGt(factoryImplementation.code.length, 0);
        assertGt(beacon.implementation().code.length, 0);
    }

    function test_LaunchWiresBeaconProxyTokenAndVaultRegistration() public {
        address creator = makeAddr("wiredCreator");
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        (address token, address curveAddress) = factory.launch{value: 0.1 ether}(_params(creator));

        SqueezCurve curve = SqueezCurve(payable(curveAddress));
        address curveBeacon = address(uint160(uint256(vm.load(curveAddress, BEACON_SLOT))));
        assertEq(curveBeacon, address(beacon));
        assertEq(curve.factory(), address(factory));
        assertEq(curve.creator(), creator);
        assertEq(curve.token(), token);
        assertEq(address(curve.feeVault()), address(vault));
        assertEq(vault.curveForToken(token), curveAddress);
        assertEq(SqueezToken(token).totalSupply(), 1_000_000_000 ether);
        assertEq(SqueezToken(token).balanceOf(curveAddress), 1_000_000_000 ether);
    }

    function test_NonOwnersCannotChangeConfigOrBeaconImplementation() public {
        address attacker = makeAddr("configAttacker");
        SqueezCurveV2 nextCurveImplementation = new SqueezCurveV2();
        vm.startPrank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        factory.setLaunchConfig(_config());
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        factory.setGraduationAdapter(address(0));
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        beacon.upgradeTo(address(nextCurveImplementation));
        vm.stopPrank();
    }

    function test_CoreOwnershipTransferRequiresPendingOwnerAcceptance() public {
        address nextAdmin = makeAddr("nextAdmin");

        factory.transferOwnership(nextAdmin);
        vault.transferOwnership(nextAdmin);
        registry.transferOwnership(nextAdmin);

        assertEq(factory.owner(), address(this));
        assertEq(vault.owner(), address(this));
        assertEq(registry.owner(), address(this));
        assertEq(factory.pendingOwner(), nextAdmin);
        assertEq(vault.pendingOwner(), nextAdmin);
        assertEq(registry.pendingOwner(), nextAdmin);

        vm.startPrank(nextAdmin);
        factory.acceptOwnership();
        vault.acceptOwnership();
        registry.acceptOwnership();
        vm.stopPrank();

        assertEq(factory.owner(), nextAdmin);
        assertEq(vault.owner(), nextAdmin);
        assertEq(registry.owner(), nextAdmin);
        assertEq(factory.pendingOwner(), address(0));
        assertEq(vault.pendingOwner(), address(0));
        assertEq(registry.pendingOwner(), address(0));
    }

    function test_OnlyPendingOwnerCanAcceptCoreOwnership() public {
        address nextAdmin = makeAddr("pendingAdmin");
        address attacker = makeAddr("ownershipAttacker");
        factory.transferOwnership(nextAdmin);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", attacker));
        factory.acceptOwnership();
        assertEq(factory.owner(), address(this));
        assertEq(factory.pendingOwner(), nextAdmin);
    }

    function test_FeeVaultUpgradePreservesLegacyStorageLayout() public {
        LegacySqueezFeeVault legacyImplementation = new LegacySqueezFeeVault();
        LegacySqueezFeeVault legacy = LegacySqueezFeeVault(
            payable(address(
                    new ERC1967Proxy(
                        address(legacyImplementation),
                        abi.encodeCall(LegacySqueezFeeVault.initialize, (address(this), treasury))
                    )
                ))
        );
        address legacyToken = makeAddr("legacyToken");
        address legacyCurve = makeAddr("legacyCurve");
        address legacyAsset = makeAddr("legacyAsset");
        legacy.seed(legacyToken, legacyCurve, legacyAsset);

        legacy.upgradeToAndCall(address(new SqueezFeeVault()), "");
        SqueezFeeVault upgraded = SqueezFeeVault(payable(address(legacy)));

        assertEq(upgraded.owner(), address(this));
        assertEq(upgraded.treasury(), treasury);
        assertEq(upgraded.curveForToken(legacyToken), legacyCurve);
        assertEq(upgraded.creatorFeesAccrued(legacyToken, legacyAsset), 2 ether);
        assertEq(upgraded.buybackBalance(legacyAsset), 0.8 ether);
        assertEq(upgraded.treasuryBalance(legacyAsset), 0.2 ether);
        assertEq(upgraded.hook(), address(0));
        assertEq(upgraded.buybackOperator(), address(0));
        assertEq(upgraded.buybackWithdrawalCap(legacyAsset), 0);
    }

    function test_BeaconUpgradeKeepsCurveAddressAndState() public {
        address creator = makeAddr("creator");
        vm.deal(creator, 1 ether);
        vm.prank(creator);
        (address token, address curveAddress) = factory.launch{value: 0.1 ether}(_params(creator));
        SqueezCurve curve = SqueezCurve(payable(curveAddress));
        assertEq(curve.token(), token);

        beacon.upgradeTo(address(new SqueezCurveV2()));

        assertEq(address(curve), curveAddress);
        assertEq(SqueezCurveV2(payable(curveAddress)).version(), 2);
        assertEq(curve.token(), token);
        assertEq(curve.creator(), creator);
        assertEq(curve.factory(), address(factory));
        assertEq(curve.hypeRaised(), 0);
    }

    function _params(address creator) private pure returns (LaunchParams memory p) {
        p.name = "Upgrade Test";
        p.symbol = "UPG";
        p.metadataURI = "ipfs://upgrade-test";
        p.feeRecipient = creator;
        p.creatorFeeBps = 100;
        p.feeDestination = FeeDestination({kind: FeeDestinationType.Wallet, buybackBps: 0});
    }

    function _config() private pure returns (LaunchConfig memory) {
        return LaunchConfig({
            graduationThresholdHype: 400 ether,
            virtualHypeReserve: 160 ether,
            virtualTokenReserve: 1_000_000_000 ether,
            sniperTaxStartBps: 9_900,
            sniperTaxDecaySeconds: 5,
            maxWalletBps: 500,
            maxWalletWindowSeconds: 300,
            launchFeeHype: 0.1 ether
        });
    }
}
