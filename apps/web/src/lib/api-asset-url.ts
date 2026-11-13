import { apiUrl } from "./chain";

/** Resolve API-proxied assets without duplicating a chain-qualified `/v1/...` prefix. */
export function apiAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  try {
    return new URL(path, `${apiUrl}/`).toString();
  } catch {
    return null;
  }
}
