"use client";

import { useEffect, useState } from "react";
import { useProtocolConfig } from "./protocol-config";
import { useSelectedTarget } from "./use-selected-target";

export function useCommunityCanary() {
  const selected = useSelectedTarget();
  const protocol = useProtocolConfig();
  const release = protocol.data?.release;
  const isMainnet = selected.target.stage === "mainnet";
  const storageKey = release
    ? `squeez.risk-ack.${selected.info.chainId}.${release.acknowledgementVersion}`
    : null;
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    setAcknowledged(Boolean(storageKey && window.localStorage.getItem(storageKey) === "accepted"));
  }, [storageKey]);

  const accept = () => {
    if (!storageKey) return;
    window.localStorage.setItem(storageKey, "accepted");
    setAcknowledged(true);
  };

  const open = !isMainnet || Boolean(release?.communityTestingEnabled && release.mode !== "internal");
  const actionAllowed = open && (!isMainnet || acknowledged);
  return { isMainnet, release, open, acknowledged, actionAllowed, accept };
}
