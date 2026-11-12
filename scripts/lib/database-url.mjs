export function operationalDatabaseUrl(value) {
  const url = new URL(value);

  // Supabase's session pool is intentionally small and is reserved for the
  // long-running API/indexer processes. One-shot release checks should use
  // transaction pooling so they cannot starve production services.
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") {
    url.port = "6543";
  }

  return url.toString();
}
