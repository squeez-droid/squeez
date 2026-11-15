const NETWORKS = new Set(["mainnet", "testnet", "all"]);

export function selectReadinessTargets(targets, network = "mainnet") {
  if (!NETWORKS.has(network)) {
    throw Object.assign(new Error("Invalid network filter"), { status: 400 });
  }

  return targets.filter((target) => target.upstream
    && target.capability !== "coming-soon"
    && (network === "all" || target.stage === network));
}

export function summarizeReadiness(network, checks) {
  return {
    ready: checks.length > 0 && checks.every((check) => check.ready && check.dataReady),
    network,
    targets: checks,
  };
}
