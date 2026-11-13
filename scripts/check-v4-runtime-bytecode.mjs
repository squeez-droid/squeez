import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createPublicClient, getAddress, http } from "viem";

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};
const chain = required("SQUEEZ_CHAIN");
if (!new Set(["elysium", "hyperevm", "robinhood"]).has(chain) || required("SQUEEZ_NETWORK") !== "mainnet") {
  throw new Error("runtime bytecode verification requires a supported mainnet target");
}
const expectedChainId = Number(required("SQUEEZ_CHAIN_ID"));
const expectedChainIds = { elysium: 99901, hyperevm: 999, robinhood: 4663 };
if (expectedChainId !== expectedChainIds[chain]) throw new Error(`unexpected ${chain} mainnet chain ID`);

const buildArguments = ["build", "--root", "packages/contracts"];
if (chain === "robinhood") buildArguments.push("--profile", "robinhood_mainnet");
execFileSync("forge", buildArguments, {
  stdio: "inherit",
});
const artifactRoot = chain === "robinhood" ? "packages/contracts/out-robinhood-mainnet" : "packages/contracts/out";

const contracts = [
  { name: "SqueezHook", address: required("SQUEEZ_HOOK_ADDRESS"), artifact: "SqueezHook.sol/SqueezHook.json" },
  {
    name: "SqueezLiquidityLocker", address: required("LIQUIDITY_LOCKER_ADDRESS"),
    artifact: "SqueezLiquidityLocker.sol/SqueezLiquidityLocker.json",
  },
  {
    name: "SqueezV4GraduationAdapter", address: required("GRADUATION_ADAPTER_ADDRESS"),
    artifact: "SqueezV4GraduationAdapter.sol/SqueezV4GraduationAdapter.json",
  },
  {
    name: "SqueezSwapRouter", address: required("SWAP_ROUTER_ADDRESS"),
    artifact: "SqueezSwapRouter.sol/SqueezSwapRouter.json",
  },
];

const normalize = (hex, immutableReferences) => {
  const bytes = Buffer.from(hex.replace(/^0x/, ""), "hex");
  for (const references of Object.values(immutableReferences ?? {})) {
    for (const { start, length } of references) bytes.fill(0, start, start + length);
  }
  return bytes.toString("hex");
};

const client = createPublicClient({ transport: http(required("SQUEEZ_RPC")) });
if (await client.getChainId() !== expectedChainId) throw new Error("RPC chain ID mismatch");
const results = [];
let compiler;
for (const contract of contracts) {
  const artifact = JSON.parse(readFileSync(resolve(artifactRoot, contract.artifact), "utf8"));
  const artifactCompiler = {
    version: artifact.metadata?.compiler?.version,
    optimizerEnabled: artifact.metadata?.settings?.optimizer?.enabled,
    optimizerRuns: artifact.metadata?.settings?.optimizer?.runs,
    evmVersion: artifact.metadata?.settings?.evmVersion,
    viaIR: artifact.metadata?.settings?.viaIR ?? false,
  };
  if (!artifactCompiler.version) throw new Error(`${contract.name} artifact has no compiler metadata`);
  if (!compiler) compiler = artifactCompiler;
  else if (JSON.stringify(compiler) !== JSON.stringify(artifactCompiler)) {
    throw new Error(`${contract.name} compiler settings differ from the other v4 artifacts`);
  }
  const compiled = artifact.deployedBytecode?.object;
  if (!compiled || compiled === "0x") throw new Error(`${contract.name} artifact has no runtime bytecode`);
  const onchain = await client.getCode({ address: getAddress(contract.address) });
  if (!onchain || onchain === "0x") throw new Error(`${contract.name} has no onchain bytecode`);
  const immutableReferences = artifact.deployedBytecode?.immutableReferences ?? {};
  const compiledNormalized = normalize(compiled, immutableReferences);
  const onchainNormalized = normalize(onchain, immutableReferences);
  if (compiledNormalized !== onchainNormalized) throw new Error(`${contract.name} runtime bytecode mismatch`);
  results.push({
    name: contract.name,
    address: getAddress(contract.address),
    runtimeBytes: (onchain.length - 2) / 2,
    immutableSlots: Object.values(immutableReferences).flat().length,
    matchesCompilerArtifact: true,
  });
}
console.log(JSON.stringify({ ready: true, chainId: expectedChainId, compiler, results }, null, 2));
