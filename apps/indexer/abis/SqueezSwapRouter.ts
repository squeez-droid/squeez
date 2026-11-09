export const SqueezSwapRouterAbi = [
  {
    type: "event",
    name: "PoolSwap",
    anonymous: false,
    inputs: [
      { indexed: true, name: "token", type: "address" },
      { indexed: true, name: "trader", type: "address" },
      { indexed: false, name: "isBuy", type: "bool" },
      { indexed: false, name: "quoteAmount", type: "uint256" },
      { indexed: false, name: "tokenAmount", type: "uint256" },
    ],
  },
] as const;
