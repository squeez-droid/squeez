"use client";
import { config, content } from "@/lib/data";
import { THRESHOLD } from "@/lib/curve";
import { useWallet } from "@/providers/wallet";
import { Button, Card, Field, Input } from "@/components/ui";
import { WalletGateButton } from "@/components/wallet-ui";
import { CreatorFeeSlider } from "./creator-fee";
import { FeeDestinations } from "./fee-destinations";
import { OpeningBuy } from "./opening-buy";
import { PairPicker } from "./pair-picker";
import type { LaunchFormApi } from "./use-launch-form";

const T = content.launch.form;
const P = config.protocol;
const LC = config.launchConfig;

interface EconomicsStepProps {
  api: LaunchFormApi;
  onBack: () => void;
  onReview: () => void;
  onRequestHolders: () => void;
}

export function EconomicsStep({ api, onBack, onReview, onRequestHolders }: EconomicsStepProps) {
  const w = useWallet();
  const { form: f, set } = api;
  const walletError = api.economicsErrors.feeWallet;

  return (
    <Card className="mt-4 space-y-6 p-5">
      <PairPicker api={api} />

      <Field label={T.feeWalletLabel} hint={T.feeWalletHint} error={walletError && f.feeWallet ? walletError : null}>
        <div className="flex gap-2">
          <Input className="num" value={f.feeWallet} onChange={(e) => set("feeWallet", e.target.value.trim())} placeholder={w.address ?? T.feeWalletPlaceholder} />
          {w.address && f.feeWallet !== w.address && (
            <Button variant="secondary" onClick={() => set("feeWallet", w.address!)}>{T.useMine}</Button>
          )}
        </div>
      </Field>

      <CreatorFeeSlider api={api} />
      <FeeDestinations api={api} onRequestHolders={onRequestHolders} />
      <OpeningBuy api={api} />

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onBack}>{T.back}</Button>
        <WalletGateButton disabled={!api.economicsOk} onClick={onReview}>{T.review}</WalletGateButton>
      </div>

      <p className="text-center text-xs text-muted sm:text-right">
        Launch fee {P.launchFeeHype} HYPE{P.launchFeeTbd && "*"}. Graduates at {THRESHOLD} HYPE{LC.graduationThresholdTbd && "*"}. Protocol fee {(P.PROTOCOL_FEE_BPS / 100).toFixed(1)}%.
        {(P.launchFeeTbd || LC.graduationThresholdTbd) && <span className="block text-[11px]">{T.footnote}</span>}
      </p>
    </Card>
  );
}
