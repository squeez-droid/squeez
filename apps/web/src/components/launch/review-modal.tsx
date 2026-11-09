"use client";
import { content } from "@/lib/data";
import { bpsToPct, fill, fmtNum, shortAddr } from "@/lib/format";
import { Button, Modal, Row } from "@/components/ui";
import { TokenAvatar } from "@/components/token-bits";
import type { LaunchFormApi } from "./use-launch-form";

const T = content.launch.review;

interface ReviewModalProps {
  api: LaunchFormApi;
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
}

export function ReviewModal({ api, open, onClose, onSubmit }: ReviewModalProps) {
  const { form: f, opening, openingQuote } = api;
  const rows: [string, string][] = [
    [T.supply, T.supplyValue],
    [T.pair, f.quote],
    [T.creatorFee, bpsToPct(f.creatorFeeBps)],
    [T.destination, api.destinationLabel],
    [T.feeWallet, shortAddr(f.feeWallet, 6)],
    [T.openingBuy, opening ? `${fmtNum(opening, 4)} HYPE → ${fmtNum(openingQuote.outAmount, 0)} ${f.ticker}` : "—"],
    [T.launchFee, `${api.protocol.data?.launchConfig.launchFeeHype ?? "—"} HYPE`],
    [T.launchConfig, `on-chain · grad ${api.protocol.data?.launchConfig.graduationThresholdHype ?? "—"} HYPE`],
  ];

  return (
    <Modal open={open} onClose={onClose} title={T.title} width="max-w-lg">
      <div className="flex items-center gap-3">
        {f.image && <TokenAvatar token={{ image: f.image, ticker: f.ticker }} size={44} />}
        <div>
          <div className="font-semibold text-white">{f.name}</div>
          <div className="text-xs text-muted">${f.ticker}</div>
        </div>
      </div>
      <div className="mt-4 rounded-lg bg-bg px-3 py-2">
        {rows.map(([label, value]) => <Row key={label} label={label} value={value} />)}
      </div>
      <p className="mt-3 text-xs text-muted">{T.locked}</p>
      {api.metadataError && <p className="mt-2 text-xs text-down">{api.metadataError}</p>}
      <Button size="lg" className="mt-4 w-full" loading={api.metadataUploading} onClick={onSubmit}>{fill(T.submit, { ticker: f.ticker })}</Button>
    </Modal>
  );
}
