#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  getAddress,
  http,
  keccak256,
  stringToHex,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

if (process.env.SQUEEZ_CHAIN !== "robinhood" || process.env.SQUEEZ_NETWORK !== "mainnet") {
  throw new Error("This canary is restricted to Robinhood mainnet");
}
const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const account = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY"));
const factory = getAddress(required("FACTORY_ADDRESS"));
const launchFee = BigInt(required("LAUNCH_FEE_HYPE"));
const rpc = required("SQUEEZ_RPC");
const uploadUrl = required("PINATA_UPLOAD_URL");
const pinataJwt = required("PINATA_JWT");
const publicClient = createPublicClient({ transport: http(rpc) });
const walletClient = createWalletClient({ account, transport: http(rpc) });

async function pin(bytes, fileName, contentType) {
  const form = new FormData();
  form.set("network", "public");
  form.set("name", fileName);
  form.set("file", new Blob([bytes], { type: contentType }), fileName);
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { authorization: `Bearer ${pinataJwt}` },
    body: form,
  });
  if (!response.ok) throw new Error(`Pinata upload failed (${response.status})`);
  const result = await response.json();
  const cid = result.data?.cid ?? result.cid ?? result.IpfsHash;
  if (!cid) throw new Error("Pinata did not return a CID");
  return `ipfs://${cid}`;
}

const logo = await readFile(new URL("../apps/web/public/squeez-logo.png", import.meta.url));
const imageHash = `0x${createHash("sha256").update(logo).digest("hex")}`;
const imageUri = await pin(logo, "squeez-logo.png", "image/png");
const suffix = Date.now().toString(36).slice(-6).toUpperCase();
const name = process.env.E2E_TOKEN_NAME?.trim() || `Squeez Proxy Canary ${suffix}`;
const symbol = process.env.E2E_TOKEN_SYMBOL?.trim() || `SQP${suffix.slice(-4)}`;
const metadata = {
  schema: "squeez.token.v2",
  name,
  symbol,
  description: "Squeez Robinhood mainnet BeaconProxy and on-chain metadata verification token.",
  image: imageUri,
  imageHash,
  decimals: 18,
  icons: [{ uri: imageUri, type: "image/png", purpose: "token-icon" }],
  interop: { erc1046: true, proxy: "beacon" },
  links: { website: "https://squeez.tech", x: "https://x.com/squeez7z" },
};
const metadataBytes = Buffer.from(JSON.stringify(metadata));
const metadataUri = await pin(metadataBytes, "squeez-token-metadata.json", "application/json");

const factoryAbi = [
  { type: "function", name: "launchWithIdentity", stateMutability: "payable", inputs: [
    { name: "p", type: "tuple", components: [
      { name: "name", type: "string" }, { name: "symbol", type: "string" },
      { name: "metadataURI", type: "string" }, { name: "quote", type: "address" },
      { name: "feeRecipient", type: "address" }, { name: "creatorFeeBps", type: "uint16" },
      { name: "feeDestination", type: "tuple", components: [
        { name: "kind", type: "uint8" }, { name: "buybackBps", type: "uint16" },
      ] },
      { name: "openingBuyHype", type: "uint256" }, { name: "openingBuyMinTokens", type: "uint256" },
    ] },
    { name: "evidence", type: "tuple", components: [
      { name: "imageHash", type: "bytes32" }, { name: "socialHash", type: "bytes32" },
      { name: "templateVersion", type: "uint32" },
    ] },
  ], outputs: [{ type: "address" }, { type: "address" }] },
  { type: "event", name: "TokenLaunched", inputs: [
    { indexed: true, name: "token", type: "address" }, { indexed: true, name: "curve", type: "address" },
    { indexed: true, name: "creator", type: "address" }, { indexed: false, name: "quote", type: "address" },
    { indexed: false, name: "creatorFeeBps", type: "uint16" },
    { indexed: false, name: "launchConfigId", type: "uint256" },
    { indexed: false, name: "feeRecipient", type: "address" },
    { indexed: false, name: "feeDestinationKind", type: "uint8" },
    { indexed: false, name: "buybackBps", type: "uint16" },
  ] },
];
const balance = await publicClient.getBalance({ address: account.address });
if (balance < launchFee) throw new Error("Deployer balance is below the launch fee");
const hash = await walletClient.writeContract({
  account,
  address: factory,
  abi: factoryAbi,
  functionName: "launchWithIdentity",
  value: launchFee,
  args: [
    {
      name, symbol, metadataURI: metadataUri, quote: zeroAddress, feeRecipient: account.address,
      creatorFeeBps: 100, feeDestination: { kind: 0, buybackBps: 0 },
      openingBuyHype: 0n, openingBuyMinTokens: 0n,
    },
    { imageHash, socialHash: keccak256(stringToHex("https://x.com/squeez7z")), templateVersion: 2 },
  ],
});
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`Launch transaction reverted: ${hash}`);
const launched = receipt.logs.map((log) => {
  try { return decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics }); } catch { return null; }
}).find((event) => event?.eventName === "TokenLaunched");
if (!launched) throw new Error("TokenLaunched event missing from receipt");

const token = getAddress(launched.args.token);
const tokenAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "metadataURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "tokenURI", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "metadataHash", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "imageHash", stateMutability: "view", inputs: [], outputs: [{ type: "bytes32" }] },
  { type: "function", name: "metadataVersion", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];
const beaconSlot = "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50";
const [storedName, storedSymbol, storedMetadataUri, tokenUri, storedMetadataHash, storedImageHash, metadataVersion, rawBeacon] =
  await Promise.all([
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: "name" }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: "symbol" }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: "metadataURI" }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: "tokenURI" }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: "metadataHash" }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: "imageHash" }),
    publicClient.readContract({ address: token, abi: tokenAbi, functionName: "metadataVersion" }),
    publicClient.getStorageAt({ address: token, slot: beaconSlot }),
  ]);
const beacon = getAddress(`0x${rawBeacon.slice(-40)}`);
const expectedBeacon = getAddress(required("TOKEN_BEACON_ADDRESS"));
if (beacon !== expectedBeacon) throw new Error(`Unexpected token beacon: ${beacon}`);
if (storedMetadataUri !== metadataUri || tokenUri !== metadataUri) throw new Error("Metadata URI mismatch");
if (storedImageHash.toLowerCase() !== imageHash.toLowerCase()) throw new Error("Image hash mismatch");

console.log(JSON.stringify({
  transactionHash: hash,
  blockNumber: receipt.blockNumber.toString(),
  token,
  curve: getAddress(launched.args.curve),
  creator: account.address,
  name: storedName,
  symbol: storedSymbol,
  proxy: { type: "BeaconProxy", beacon },
  metadata: {
    uri: storedMetadataUri,
    tokenUri,
    uriHash: storedMetadataHash,
    imageUri,
    imageHash: storedImageHash,
    version: metadataVersion.toString(),
  },
}, null, 2));
