// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SqueezQuoteRegistry} from "../src/SqueezQuoteRegistry.sol";
import {ISqueezQuoteRegistry} from "../src/interfaces/ISqueezQuoteRegistry.sol";

contract MockQuoteToken is ERC20 {
    constructor() ERC20("USD Coin", "USDC") {}
}

contract SqueezQuoteRegistryTest is Test {
    SqueezQuoteRegistry internal registry;
    MockQuoteToken internal usdc;

    function setUp() public {
        registry = new SqueezQuoteRegistry(address(this));
        usdc = new MockQuoteToken();
    }

    function test_NativeHypeIsActiveByDefault() public view {
        ISqueezQuoteRegistry.QuoteAsset memory hype = registry.getQuote(address(0));
        assertTrue(hype.active);
        assertEq(hype.decimals, 18);
        assertEq(hype.routerPath.length, 0);
    }

    function test_AddUpdateAndEnumerateQuoteWithoutDuplicates() public {
        registry.setQuote(_usdc(true));
        registry.setQuote(_usdc(false));
        registry.setQuote(_usdc(true));

        ISqueezQuoteRegistry.QuoteAsset[] memory active = registry.getActiveQuotes();
        assertEq(active.length, 2);
        assertEq(active[0].asset, address(0));
        assertEq(active[1].asset, address(usdc));
    }

    function test_RejectsEOAAsQuoteAsset() public {
        ISqueezQuoteRegistry.QuoteAsset memory quote = _usdc(true);
        quote.asset = makeAddr("notAContract");
        vm.expectRevert(SqueezQuoteRegistry.InvalidQuote.selector);
        registry.setQuote(quote);
    }

    function test_RejectsActiveErc20WithoutGraduationRoute() public {
        ISqueezQuoteRegistry.QuoteAsset memory quote = _usdc(true);
        quote.routerPath = "";
        vm.expectRevert(SqueezQuoteRegistry.InvalidQuote.selector);
        registry.setQuote(quote);
    }

    function test_NativeHypeCannotBeDisabledOrChanged() public {
        vm.expectRevert(SqueezQuoteRegistry.InvalidQuote.selector);
        registry.setQuote(
            ISqueezQuoteRegistry.QuoteAsset({asset: address(0), decimals: 18, routerPath: "", active: false})
        );
    }

    function _usdc(bool active) private view returns (ISqueezQuoteRegistry.QuoteAsset memory) {
        return
            ISqueezQuoteRegistry.QuoteAsset({asset: address(usdc), decimals: 6, routerPath: hex"1234", active: active});
    }
}
