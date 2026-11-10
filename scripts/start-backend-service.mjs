import { spawn } from "node:child_process";

const network = process.env.SQUEEZ_NETWORK === "mainnet" ? "mainnet" : "testnet";
const service = process.env.SQUEEZ_SERVICE ?? "api";
const workspaces = {
  api: "@squeez/backend",
  indexer: "@squeez/indexer",
  keeper: "@squeez/keeper",
};
const workspace = workspaces[service];

if (!workspace) {
  console.error(`[service] unsupported SQUEEZ_SERVICE: ${service}`);
  process.exit(64);
}

const child = spawn("npm", ["run", `start:${network}`, "-w", workspace], {
  env: process.env,
  stdio: "inherit",
});
let stopping = false;

function stop(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
}

child.on("exit", (code, signal) => {
  if (!stopping && (code !== 0 || signal)) {
    console.error(`[service] ${service} exited (${signal ?? code ?? "unknown"})`);
  }
  process.exitCode = stopping ? 0 : (code ?? (signal ? 1 : 0));
});

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
