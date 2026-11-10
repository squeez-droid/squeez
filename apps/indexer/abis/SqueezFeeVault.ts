export const SqueezFeeVaultAbi = [
  {
    type: "event",
    name: "ProtectionTaxAccrued",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreatorFeeAccrued",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CreatorFeeClaimed",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "ProtocolFeeAccrued",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "asset", type: "address", indexed: true },
      { name: "buybackAmount", type: "uint256", indexed: false },
      { name: "treasuryAmount", type: "uint256", indexed: false },
    ],
  },
] as const;
