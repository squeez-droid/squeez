export const launchFactoryAbi = [
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
