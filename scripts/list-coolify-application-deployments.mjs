#!/usr/bin/env node

import { readFileSync } from "node:fs";

const applicationUuids = new Set(process.argv.slice(2).filter(Boolean));
if (!applicationUuids.size) throw new Error("Usage: list-coolify-application-deployments.mjs <application-uuid> [...uuid]");
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

const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
const applicationsResponse = await fetch(`${base}/api/v1/applications`, { headers });
if (!applicationsResponse.ok) throw new Error(`Application list failed (${applicationsResponse.status})`);
const applicationsPayload = await applicationsResponse.json();
const applications = Array.isArray(applicationsPayload) ? applicationsPayload : applicationsPayload.data ?? [];
const selectedSummaries = applications.filter((row) => applicationUuids.has(row.uuid));
const selectedApplications = await Promise.all(selectedSummaries.map(async (summary) => {
  const detailResponse = await fetch(`${base}/api/v1/applications/${summary.uuid}`, { headers });
  if (!detailResponse.ok) throw new Error(`Application ${summary.uuid} detail failed (${detailResponse.status})`);
  return detailResponse.json();
}));
const applicationIds = new Set(selectedApplications.map((row) => String(row.id)));
const applicationNames = new Set(selectedApplications.map((row) => row.name));
const applicationById = new Map(selectedApplications.map((row) => [String(row.id), row]));
const response = await fetch(`${base}/api/v1/deployments?per_page=50`, {
  headers,
});
const text = await response.text();
if (!response.ok) throw new Error(`Deployment list failed (${response.status}): ${text}`);
const payload = text ? JSON.parse(text) : {};
const rows = Array.isArray(payload)
  ? payload
  : (Array.isArray(payload.data) ? payload.data : Object.values(payload));
const matches = rows.filter((row) => applicationIds.has(String(row.application_id)) || applicationNames.has(row.application_name));
console.log(JSON.stringify(matches.map((row) => ({
  uuid: row.deployment_uuid ?? row.uuid,
  applicationId: row.application_id ?? null,
  applicationUuid: applicationById.get(String(row.application_id))?.uuid ?? row.application_uuid,
  applicationName: applicationById.get(String(row.application_id))?.name ?? row.application_name,
  status: row.status,
  commit: row.commit,
  createdAt: row.created_at,
  finishedAt: row.finished_at,
})), null, 2));
if (!matches.length) {
  console.error(JSON.stringify({ selectedApplications: selectedApplications.map(({ id, uuid, name }) => ({ id, uuid, name })), availableFields: Object.keys(rows[0] ?? {}), recentResources: rows.slice(0, 10).map((row) => ({
    application_id: row.application_id ?? null,
    application_name: row.application_name ?? null,
    application_uuid: row.application_uuid ?? null,
    resource_uuid: row.resource_uuid ?? null,
    status: row.status ?? null,
    deployment_uuid: row.deployment_uuid ?? null,
    created_at: row.created_at ?? null,
    deploy_started_at: row.deploy_started_at ?? null,
  })) }, null, 2));
}
