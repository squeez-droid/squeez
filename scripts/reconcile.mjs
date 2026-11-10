import pg from "pg";
import { createPublicClient, http, isAddress, zeroAddress } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const rpc = required("SQUEEZ_RPC");
const databaseUrl = required("DATABASE_URL");
const schema = required("DATABASE_SCHEMA");
const feeVault = required("FEE_VAULT_ADDRESS");
const chainId = Number(required("SQUEEZ_CHAIN_ID"));
if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new Error("DATABASE_SCHEMA is invalid");
if (!isAddress(feeVault)) throw new Error("FEE_VAULT_ADDRESS is invalid");

const client = createPublicClient({ transport: http(rpc) });
const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
const vaultAbi = [
  { type: "function", name: "creatorFeesAccrued", stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "buybackBalance", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "treasuryBalance", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
];
const curveAbi = [
  { type: "function", name: "hypeRaised", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "sniperTaxAccrued", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
];

try {
  const actualChainId = await client.getChainId();
  if (actualChainId !== chainId) throw new Error(`RPC chain mismatch: expected ${chainId}, received ${actualChainId}`);
  const { rows: tokens } = await pool.query(
    `select address, curve, status from "${schema}".token order by address`,
  );
  const { rows: indexedFees } = await pool.query(
    `select token,
      coalesce(sum(case when kind='accrued' then amount else -amount end),0)::text as liability
     from "${schema}".creator_fee where asset=$1 group by token`, [zeroAddress],
  );
  const indexedByToken = new Map(indexedFees.map((row) => [row.token.toLowerCase(), BigInt(row.liability)]));
  const mismatches = [];
  let creatorLiabilities = 0n;
  for (const token of tokens) {
    const onchain = await client.readContract({ address: feeVault, abi: vaultAbi,
      functionName: "creatorFeesAccrued", args: [token.address, zeroAddress] });
    creatorLiabilities += onchain;
    const indexed = indexedByToken.get(token.address.toLowerCase()) ?? 0n;
    if (indexed !== onchain) mismatches.push({ kind: "creator-liability", token: token.address,
      indexed: indexed.toString(), onchain: onchain.toString() });
    if (token.status === "curve") {
      const [hypeRaised, sniperTax, balance] = await Promise.all([
        client.readContract({ address: token.curve, abi: curveAbi, functionName: "hypeRaised" }),
        client.readContract({ address: token.curve, abi: curveAbi, functionName: "sniperTaxAccrued" }),
        client.getBalance({ address: token.curve }),
      ]);
      if (balance !== hypeRaised + sniperTax) mismatches.push({ kind: "curve-native-balance", token: token.address,
        expected: (hypeRaised + sniperTax).toString(), onchain: balance.toString() });
    }
  }
  const [buyback, treasury, vaultBalance] = await Promise.all([
    client.readContract({ address: feeVault, abi: vaultAbi, functionName: "buybackBalance", args: [zeroAddress] }),
    client.readContract({ address: feeVault, abi: vaultAbi, functionName: "treasuryBalance", args: [zeroAddress] }),
    client.getBalance({ address: feeVault }),
  ]);
  const accountedVaultBalance = creatorLiabilities + buyback + treasury;
  if (vaultBalance !== accountedVaultBalance) mismatches.push({ kind: "vault-native-balance",
    expected: accountedVaultBalance.toString(), onchain: vaultBalance.toString() });

  console.log(JSON.stringify({ chain: process.env.SQUEEZ_CHAIN, network: process.env.SQUEEZ_NETWORK, schema, chainId, tokenCount: tokens.length,
    vault: { balance: vaultBalance.toString(), accounted: accountedVaultBalance.toString(),
      creatorLiabilities: creatorLiabilities.toString(), buyback: buyback.toString(), treasury: treasury.toString() },
    mismatchCount: mismatches.length, mismatches }, null, 2));
  if (mismatches.length) process.exitCode = 2;
} finally {
  await pool.end();
}
