import { createPublicClient, createWalletClient, decodeEventLog, http, zeroAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const pinataJwt = required("PINATA_JWT");
const uploadUrl = required("PINATA_UPLOAD_URL");
const factory = required("FACTORY_ADDRESS");
const launchFee = BigInt(required("LAUNCH_FEE_HYPE"));
const chain = required("SQUEEZ_CHAIN");
const account = privateKeyToAccount(required("DEPLOYER_PRIVATE_KEY"));
const transport = http(required("SQUEEZ_RPC"));
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });

async function pin(blob, name) {
  const form = new FormData();
  form.set("network", "public");
  form.set("name", name);
  form.set("file", blob, name);
  const response = await fetch(uploadUrl, { method: "POST", headers: { authorization: `Bearer ${pinataJwt}` }, body: form });
  if (!response.ok) throw new Error(`Pinata upload failed (${response.status})`);
  const result = await response.json();
  const cid = result.data?.cid ?? result.cid;
  if (!cid) throw new Error("Pinata did not return a CID");
  return `ipfs://${cid}`;
}

// Deterministic 1x1 PNG used only by the permanent on-chain testnet smoke launch.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
const imageUri = await pin(new Blob([Uint8Array.from(png)], { type: "image/png" }), "squeez-e2e-image.png");
const metadata = {
  schema: "squeez.token.v1",
  name: process.env.E2E_TOKEN_NAME?.trim() || (chain === "robinhood" ? "Squeez Robinhood E2E" : "Squeez E2E"),
  symbol: process.env.E2E_TOKEN_SYMBOL?.trim() || (chain === "robinhood" ? "SQRH" : "SQE2E"),
  description: `Permanent ${chain} testnet launch lifecycle evidence.`, image: imageUri, links: {},
};
const metadataUri = await pin(new Blob([JSON.stringify(metadata)], { type: "application/json" }), "squeez-e2e-metadata.json");

const abi = [
  { type: "function", name: "launch", stateMutability: "payable", inputs: [{ name: "p", type: "tuple", components: [
    { name: "name", type: "string" }, { name: "symbol", type: "string" }, { name: "metadataURI", type: "string" },
    { name: "quote", type: "address" }, { name: "feeRecipient", type: "address" },
    { name: "creatorFeeBps", type: "uint16" }, { name: "feeDestination", type: "tuple", components: [
      { name: "kind", type: "uint8" }, { name: "buybackBps", type: "uint16" }] },
    { name: "openingBuyHype", type: "uint256" }, { name: "openingBuyMinTokens", type: "uint256" },
  ] }], outputs: [{ type: "address" }, { type: "address" }] },
  { type: "event", name: "TokenLaunched", inputs: [
    { indexed: true, name: "token", type: "address" }, { indexed: true, name: "curve", type: "address" },
    { indexed: true, name: "creator", type: "address" }, { indexed: false, name: "quote", type: "address" },
    { indexed: false, name: "creatorFeeBps", type: "uint16" }, { indexed: false, name: "launchConfigId", type: "uint256" },
    { indexed: false, name: "feeRecipient", type: "address" }, { indexed: false, name: "feeDestinationKind", type: "uint8" },
    { indexed: false, name: "buybackBps", type: "uint16" },
  ] },
];
const hash = await walletClient.writeContract({ address: factory, abi, functionName: "launch", value: launchFee,
  args: [{ name: metadata.name, symbol: metadata.symbol, metadataURI: metadataUri, quote: zeroAddress,
    feeRecipient: account.address, creatorFeeBps: 100, feeDestination: { kind: 0, buybackBps: 0 },
    openingBuyHype: 0n, openingBuyMinTokens: 0n }] });
const receipt = await publicClient.waitForTransactionReceipt({ hash });
if (receipt.status !== "success") throw new Error(`Launch transaction reverted: ${hash}`);
const launched = receipt.logs.map((log) => {
  try { return decodeEventLog({ abi, data: log.data, topics: log.topics }); } catch { return null; }
}).find((event) => event?.eventName === "TokenLaunched");
if (!launched) throw new Error("TokenLaunched event missing from receipt");
console.log(JSON.stringify({ hash, blockNumber: receipt.blockNumber.toString(), imageUri, metadataUri,
  token: launched.args.token, curve: launched.args.curve, creator: account.address }, null, 2));
