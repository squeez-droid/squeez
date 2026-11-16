#!/usr/bin/env node

import { readFileSync } from "node:fs";

const target = `${process.env.SQUEEZ_CHAIN}:${process.env.SQUEEZ_NETWORK}`;
if (!['elysium:mainnet', 'hyperevm:mainnet', 'robinhood:mainnet'].includes(target)) {
  throw new Error("Run through tools/with-env.mjs <elysium|hyperevm|robinhood> mainnet");
}

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).flatMap((raw) => {
  const line = raw.trim();
  if (!line || line.startsWith("#") || !line.includes("=")) return [];
  const at = line.indexOf("=");
  return [[line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^("|')(.*)\1$/, "$2")]];
}));
const credentials = parseEnv(readFileSync(".env.testnet", "utf8"));
const base = credentials.COOLIFY_API_URL?.replace(/\/$/, "");
const token = credentials.COOLIFY_API_TOKEN;
if (!base || !token) throw new Error("COOLIFY_API_URL and COOLIFY_API_TOKEN are required in .env.testnet");
const headers = { authorization: `Bearer ${token}`, accept: "application/json", "content-type": "application/json" };

const request = async (path, init = {}) => {
  const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} failed (${response.status}): ${text}`);
  return body;
};
const rows = (payload) => Array.isArray(payload) ? payload : payload.data ?? [];
const applications = rows(await request("/api/v1/applications"));
const reference = applications.find((application) => application.name === "squeez-api-robinhood-mainnet");
if (!reference) throw new Error("Reference application squeez-api-robinhood-mainnet is missing");
const referenceDetail = await request(`/api/v1/applications/${reference.uuid}`);
const githubApps = rows(await request("/api/v1/github-apps"));
const githubApp = githubApps.find((candidate) => candidate.id === referenceDetail.source_id);
if (!githubApp) throw new Error("The GitHub App used by the reference resource is missing");
const projects = rows(await request("/api/v1/projects"));
const project = projects.find((candidate) => candidate.name === "squeez");
if (!project) throw new Error("Coolify project squeez is missing");
const projectDetail = await request(`/api/v1/projects/${project.uuid}`);
const environment = projectDetail.environments?.find((candidate) => candidate.name === "production");
if (!environment) throw new Error("Coolify production environment is missing");
const serverUuid = referenceDetail.destination?.server?.uuid;
if (!serverUuid) throw new Error("Reference application server UUID is missing");

const chain = process.env.SQUEEZ_CHAIN;
const definitions = [
  {
    name: `squeez-api-${chain}-mainnet`,
    watch_paths: "Dockerfile.backend\npackage.json\npackage-lock.json\ntools/**\nscripts/start-backend-service.mjs\napps/backend/**\napps/gateway/**\npackages/shared/**\npackages/contracts/deployments/**",
  },
  {
    name: `squeez-indexer-${chain}-mainnet`,
    watch_paths: "Dockerfile.backend\npackage.json\npackage-lock.json\ntools/**\nscripts/start-backend-service.mjs\napps/indexer/**\npackages/shared/**\npackages/contracts/deployments/**",
  },
  ...(chain === "robinhood" ? [{
    name: "squeez-graduation-keeper-robinhood-mainnet",
    watch_paths: "Dockerfile.backend\npackage.json\npackage-lock.json\ntools/**\nscripts/start-backend-service.mjs\napps/keeper/**\npackages/shared/**\npackages/contracts/deployments/robinhood/**",
  }] : []),
];
const result = [];
for (const definition of definitions) {
  const existing = applications.find((application) => application.name === definition.name);
  if (existing) {
    result.push({ name: definition.name, uuid: existing.uuid, created: false });
    continue;
  }
  const created = await request("/api/v1/applications/private-github-app", {
    method: "POST",
    body: JSON.stringify({
      project_uuid: project.uuid,
      server_uuid: serverUuid,
      environment_uuid: environment.uuid,
      github_app_uuid: githubApp.uuid,
      git_repository: referenceDetail.git_repository,
      git_branch: referenceDetail.git_branch,
      build_pack: "dockerfile",
      dockerfile_location: "/Dockerfile.backend",
      ports_exposes: "3000",
      name: definition.name,
      instant_deploy: false,
      is_auto_deploy_enabled: true,
      is_auto_cancel_queued_deployments_enabled: true,
      watch_paths: definition.watch_paths,
    }),
  });
  result.push({ name: definition.name, uuid: created.uuid, created: true });
}
console.log(JSON.stringify(result, null, 2));
