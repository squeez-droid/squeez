import Link from "next/link";
import type { IndexedToken } from "@/lib/indexer";
import { Badge } from "@/components/ui";
import { shortAddr } from "@/lib/format";

export function IdentityBadges({ token, showOriginal = false }: { token: IndexedToken; showOriginal?: boolean }) {
  const lockedUntil = Number(token.lockedUntil ?? 0);
  const temporarilyLocked = lockedUntil > Math.floor(Date.now() / 1000);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {token.identityStatus === "original" && <Badge tone="mint">Original</Badge>}
      {token.identityStatus === "copy" && <Badge tone="warn">Copy</Badge>}
      {token.identityStatus === "unverified" && <Badge tone="muted">Unverified identity</Badge>}
      {token.permanentlyLocked && <Badge tone="primary">Ticker locked</Badge>}
      {!token.permanentlyLocked && temporarilyLocked && (
        <Badge tone="primary">Locked until {new Date(lockedUntil * 1000).toLocaleTimeString()}</Badge>
      )}
      {showOriginal && token.identityStatus === "copy" && token.originalToken && (
        <Link className="num text-[11px] text-primary hover:text-white" href={`/token/${token.originalToken}`}>
          Original {shortAddr(token.originalToken)} →
        </Link>
      )}
    </span>
  );
}
