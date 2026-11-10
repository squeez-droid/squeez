export const launchFactoryAbi = [
  {
    type: "function",
    name: "launchWithAttestation",
    stateMutability: "payable",
    inputs: [{
      name: "p", type: "tuple", components: [
        { name: "name", type: "string" }, { name: "symbol", type: "string" },
        { name: "metadataURI", type: "string" }, { name: "quote", type: "address" },
        { name: "feeRecipient", type: "address" }, { name: "creatorFeeBps", type: "uint16" },
        { name: "feeDestination", type: "tuple", components: [
          { name: "kind", type: "uint8" }, { name: "buybackBps", type: "uint16" },
        ] },
        { name: "openingBuyHype", type: "uint256" }, { name: "openingBuyMinTokens", type: "uint256" },
      ],
    }, {
      name: "evidence", type: "tuple", components: [
        { name: "imageHash", type: "bytes32" }, { name: "socialHash", type: "bytes32" },
        { name: "templateVersion", type: "uint32" },
      ],
    }, {
      name: "creatorAttestation", type: "tuple", components: [
        { name: "creator", type: "address" }, { name: "socialHash", type: "bytes32" },
        { name: "nameCommitment", type: "bytes32" }, { name: "symbolCommitment", type: "bytes32" },
        { name: "metadataHash", type: "bytes32" }, { name: "imageHash", type: "bytes32" },
        { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
      ],
    }, { name: "signature", type: "bytes" }],
    outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }],
  },
  {
    type: "function",
    name: "launchWithIdentity",
    stateMutability: "payable",
    inputs: [{
      name: "p",
      type: "tuple",
      components: [
        { name: "name", type: "string" },
        { name: "symbol", type: "string" },
        { name: "metadataURI", type: "string" },
        { name: "quote", type: "address" },
        { name: "feeRecipient", type: "address" },
        { name: "creatorFeeBps", type: "uint16" },
        { name: "feeDestination", type: "tuple", components: [
          { name: "kind", type: "uint8" }, { name: "buybackBps", type: "uint16" },
        ] },
        { name: "openingBuyHype", type: "uint256" },
        { name: "openingBuyMinTokens", type: "uint256" },
      ],
    }, {
      name: "evidence",
      type: "tuple",
      components: [
        { name: "imageHash", type: "bytes32" },
        { name: "socialHash", type: "bytes32" },
        { name: "templateVersion", type: "uint32" },
      ],
    }],
    outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }],
  },
  {
    type: "function",
    name: "launch",
    stateMutability: "payable",
    inputs: [{
      name: "p",
      type: "tuple",
      components: [
        { name: "name", type: "string" },
        { name: "symbol", type: "string" },
        { name: "metadataURI", type: "string" },
        { name: "quote", type: "address" },
        { name: "feeRecipient", type: "address" },
        { name: "creatorFeeBps", type: "uint16" },
        { name: "feeDestination", type: "tuple", components: [
          { name: "kind", type: "uint8" }, { name: "buybackBps", type: "uint16" },
        ] },
        { name: "openingBuyHype", type: "uint256" },
        { name: "openingBuyMinTokens", type: "uint256" },
      ],
    }],
    outputs: [{ name: "token", type: "address" }, { name: "curve", type: "address" }],
  },
  {
    type: "function",
    name: "quoteOpeningBuy",
    stateMutability: "view",
    inputs: [
      { name: "hypeIn", type: "uint256" },
      { name: "creatorFeeBps", type: "uint16" },
    ],
    outputs: [
      { name: "tokensOut", type: "uint256" },
      { name: "protocolFee", type: "uint256" },
      { name: "creatorFee", type: "uint256" },
      { name: "sniperTax", type: "uint256" },
    ],
  },
] as const;

export const curveTradeAbi = [
  {
    type: "function", name: "quoteBuy", stateMutability: "view",
    inputs: [{ name: "hypeIn", type: "uint256" }],
    outputs: [
      { name: "tokensOut", type: "uint256" },
      { name: "protocolFee", type: "uint256" },
      { name: "creatorFee", type: "uint256" },
      { name: "sniperTax", type: "uint256" },
    ],
  },
  {
    type: "function", name: "quoteSell", stateMutability: "view",
    inputs: [{ name: "tokenAmount", type: "uint256" }],
    outputs: [
      { name: "hypeOut", type: "uint256" },
      { name: "protocolFee", type: "uint256" },
      { name: "creatorFee", type: "uint256" },
    ],
  },
  {
    type: "function", name: "buy", stateMutability: "payable",
    inputs: [{ name: "minTokensOut", type: "uint256" }, { name: "deadline", type: "uint256" }],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function", name: "sell", stateMutability: "nonpayable",
    inputs: [
      { name: "tokenAmount", type: "uint256" },
      { name: "minHypeOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "hypeOut", type: "uint256" }],
  },
] as const;

export const erc20TradeAbi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "balance", type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], outputs: [{ name: "amount", type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "success", type: "bool" }] },
] as const;

export const feeVaultAbi = [
  {
    type: "function", name: "creatorFeesAccrued", stateMutability: "view",
    inputs: [{ name: "token", type: "address" }, { name: "asset", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
  {
    type: "function", name: "claimCreatorFees", stateMutability: "nonpayable",
    inputs: [{ name: "token", type: "address" }, { name: "asset", type: "address" }],
    outputs: [{ name: "amount", type: "uint256" }],
  },
] as const;

const poolKeyComponents = [
  { name: "currency0", type: "address" }, { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" }, { name: "tickSpacing", type: "int24" }, { name: "hooks", type: "address" },
] as const;

export const v4QuoterAbi = [{
  type: "function", name: "quoteExactInputSingle", stateMutability: "nonpayable",
  inputs: [{ name: "params", type: "tuple", components: [
    { name: "poolKey", type: "tuple", components: poolKeyComponents },
    { name: "zeroForOne", type: "bool" }, { name: "exactAmount", type: "uint128" },
    { name: "hookData", type: "bytes" },
  ] }],
  outputs: [{ name: "amountOut", type: "uint256" }, { name: "gasEstimate", type: "uint256" }],
}] as const;

export const v4SwapRouterAbi = [{
  type: "function", name: "swapExactInput", stateMutability: "payable",
  inputs: [
    { name: "key", type: "tuple", components: poolKeyComponents },
    { name: "zeroForOne", type: "bool" }, { name: "amountIn", type: "uint128" },
    { name: "minAmountOut", type: "uint128" }, { name: "recipient", type: "address" },
    { name: "deadline", type: "uint256" },
  ], outputs: [{ name: "amountOut", type: "uint256" }],
}] as const;
