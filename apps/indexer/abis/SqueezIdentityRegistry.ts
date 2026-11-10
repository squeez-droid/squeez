export const SqueezIdentityRegistryAbi = [
  {
    type: "event",
    name: "IdentityRegistered",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "curve", type: "address", indexed: true },
      { name: "canonicalHash", type: "bytes32", indexed: false },
      { name: "nameCommitment", type: "bytes32", indexed: false },
      { name: "symbolCommitment", type: "bytes32", indexed: false },
      { name: "duplicateName", type: "bool", indexed: false },
      { name: "duplicateSymbol", type: "bool", indexed: false },
    ],
  },
  {
    type: "event",
    name: "IdentityEvidence",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "metadataHash", type: "bytes32", indexed: false },
      { name: "imageHash", type: "bytes32", indexed: false },
      { name: "socialHash", type: "bytes32", indexed: false },
      { name: "tokenCodeHash", type: "bytes32", indexed: false },
      { name: "templateVersion", type: "uint32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "IdentityLocked",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "nameCommitment", type: "bytes32", indexed: true },
      { name: "symbolCommitment", type: "bytes32", indexed: true },
      { name: "imageHash", type: "bytes32", indexed: false },
      { name: "expiresAt", type: "uint64", indexed: false },
    ],
  },
  {
    type: "event",
    name: "SymbolPermanentlyLocked",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "symbolCommitment", type: "bytes32", indexed: true },
    ],
  },
] as const;
