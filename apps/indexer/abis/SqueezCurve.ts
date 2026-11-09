export const SqueezCurveAbi = [
  {
    type: "event",
    name: "CurveTrade",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "hypeAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "hypeRaised", type: "uint256", indexed: false },
    ],
  },
] as const;
