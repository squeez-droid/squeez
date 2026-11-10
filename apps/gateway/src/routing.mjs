export const TARGETS = [
  ["elysium", "testnet", 99801, "ELYSIUM_TESTNET"],
  ["elysium", "mainnet", 99901, "ELYSIUM_MAINNET"],
  ["robinhood", "testnet", 46630, "ROBINHOOD_TESTNET"],
  ["robinhood", "mainnet", 4663, "ROBINHOOD_MAINNET"],
];

export function readTargets(env) {
  return TARGETS.map(([chain, stage, chainId, prefix]) => {
    const upstream = env[`${prefix}_API_URL`]?.replace(/\/$/, "") || null;
    const configuredCapability = env[`${prefix}_CAPABILITY`];
    const capability = configuredCapability || (upstream ? "enabled" : "coming-soon");
    if (!["enabled", "read-only", "maintenance", "coming-soon"].includes(capability)) {
      throw new Error(`${prefix}_CAPABILITY is invalid`);
    }
    if (["enabled", "read-only"].includes(capability) && !upstream) {
      throw new Error(`${prefix}_API_URL is required when capability=${capability}`);
    }
    return { chain, stage, chainId, id: `${chain}:${stage}`, upstream, capability };
  });
}

export function resolveUpstream(pathname, targets) {
  const match = pathname.match(/^\/v1\/(elysium|robinhood)\/(testnet|mainnet)(?:\/|$)/);
  if (!match) return { kind: "unmatched" };
  const target = targets.find((candidate) => candidate.chain === match[1] && candidate.stage === match[2]);
  if (!target || target.capability === "coming-soon") return { kind: "unavailable", status: 404, target };
  if (target.capability === "maintenance") return { kind: "unavailable", status: 503, target };
  return { kind: "proxy", target };
}

export function isReadOnlyRequestAllowed(method = "GET", pathname = "/") {
  if (["HEAD", "OPTIONS"].includes(method)) return true;
  if (method === "POST" && /(?:^|\/)rpc$/.test(pathname)) return true;
  if (method !== "GET") return false;
  // These GET endpoints issue one-time write credentials and are not part of read-only operation.
  if (/\/auth\/x\/nonce$/.test(pathname) || /\/metadata\/nonce$/.test(pathname)) return false;
  return true;
}
