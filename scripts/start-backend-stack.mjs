import { spawn } from "node:child_process";

const network = process.env.SQUEEZ_NETWORK === "mainnet" ? "mainnet" : "testnet";
const services = [
  { name: "api", workspace: "@squeez/backend" },
  { name: "indexer", workspace: "@squeez/indexer" },
];
const children = new Map();
let stopping = false;

function stop(signal = "SIGTERM") {
  if (stopping) return;
  stopping = true;
  for (const child of children.values()) child.kill(signal);
}

for (const service of services) {
  const child = spawn("npm", ["run", `start:${network}`, "-w", service.workspace], {
    env: process.env,
    stdio: "inherit",
  });
  children.set(service.name, child);
  child.on("exit", (code, signal) => {
    console.error(`[stack] ${service.name} exited (${signal ?? code ?? "unknown"}); stopping container`);
    stop();
    process.exitCode = code && code > 0 ? code : 1;
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
