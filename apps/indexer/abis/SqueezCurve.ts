export const SqueezCurveAbi = [
  {
    type: "event",
    name: "GraduationThresholdReached",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "hypeRaised", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "GraduationAttempted",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "adapter", type: "address", indexed: true },
    ],
  },
  {
    type: "event",
    name: "Graduated",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "pool", type: "address", indexed: false },
      { name: "quoteAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
    ],
  },
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
