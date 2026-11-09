import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(process.argv[2] ?? ".env.testnet");
const source = await readFile(target, "utf8");
const match = source.match(/^DATABASE_URL=(.+)$/m);
if (!match) throw new Error("DATABASE_URL was not found");
const connection = match[1].trim();
const parts = connection.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.+)@([^/]+)(\/.*)$/);
if (!parts) throw new Error("DATABASE_URL does not match a PostgreSQL connection string");
const [, scheme, username, password, authority, path] = parts;
const decoded = (() => { try { return decodeURIComponent(password); } catch { return password; } })();
const normalized = `${scheme}${username}:${encodeURIComponent(decoded)}@${authority}${path}`;
new URL(normalized);
await writeFile(target, source.replace(/^DATABASE_URL=.+$/m, `DATABASE_URL=${normalized}`), { mode: 0o600 });
console.log("DATABASE_URL password encoding normalized.");
