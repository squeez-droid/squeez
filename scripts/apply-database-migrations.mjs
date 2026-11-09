import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import pg from "pg";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required");
const directory = resolve("supabase/migrations");
const files = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
const client = new pg.Client({ connectionString });
await client.connect();
try {
  await client.query("select pg_advisory_lock($1)", [99801]);
  for (const file of files) {
    const sql = await readFile(resolve(directory, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("commit");
      console.log(`Applied ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock($1)", [99801]).catch(() => undefined);
  await client.end();
}
