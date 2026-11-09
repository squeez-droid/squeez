// Canonical event ABI. Verify it against the Foundry artifact before deployment.
export const SqueezLaunchFactoryAbi = [
  {
    type: "event",
    name: "TokenLaunched",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "quote", type: "address", indexed: false },
      { name: "creatorFeeBps", type: "uint16", indexed: false },
      { name: "launchConfigId", type: "uint256", indexed: false },
      { name: "feeRecipient", type: "address", indexed: false },
      { name: "feeDestinationKind", type: "uint8", indexed: false },
      { name: "buybackBps", type: "uint16", indexed: false },
    ],
  },
  {
    type: "event",
    name: "TokenMetadata",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "metadataURI", type: "string", indexed: false },
    ],
  },
] as const;
