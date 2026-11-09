"use client";
import clsx from "clsx";
import { config, content } from "@/lib/data";
import { fill } from "@/lib/format";
import { Badge, ChoiceCard } from "@/components/ui";
import { IconCheck } from "@/components/icons";
import { Note } from "./pair-picker";
import type { Destination, LaunchFormApi } from "./use-launch-form";

const T = content.launch.form;
const VEST = config.launchConfig.buybackVest;

interface FeeDestinationsProps {
  api: LaunchFormApi;
  /** Called when the user picks "Holders": needs the two-step confirmation modal. */
  onRequestHolders: () => void;
}

export function FeeDestinations({ api, onRequestHolders }: FeeDestinationsProps) {
  const { form: f, set } = api;
  const error = api.economicsErrors.dest;

  const isChecked = (d: Destination) => (d === "wallet" ? f.destWallet : d === "buyback" ? f.destBuyback : f.destHolders);
  const toggle = (d: Destination) => {
    if (d !== "holders") return api.toggleDestination(d);
    if (f.destHolders) api.disableHolders();
    else onRequestHolders();
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-white">{T.destLabel}</span>
        {error && <span className="text-xs text-down">{error}</span>}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        {content.launch.destinations.map((d) => {
          const id = d.id as Destination;
          const checked = isChecked(id);
          return (
            <ChoiceCard key={id} selected={checked} disabled={f.creatorFeeBps === 0} onClick={() => toggle(id)} className="p-3">
              <div className="flex items-center gap-2">
                <span aria-hidden className={clsx("flex h-4 w-4 items-center justify-center rounded-sm border", checked ? "border-white bg-white text-bg" : "border-muted")}>
                  {checked && <IconCheck width={12} height={12} />}
                </span>
                <span className="text-sm font-medium text-white">{d.label}</span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">{d.body}</p>
              <Badge tone={id === "holders" ? "warn" : "muted"} className="mt-2">{d.badge}</Badge>
            </ChoiceCard>
          );
        })}
      </div>

      {f.destBuyback && (
        <div className="mt-3 rounded-md border border-line bg-bg p-3">
          <div className="flex justify-between text-xs">
            <span className="text-muted">{T.buybackSplit}</span>
            <span className="num text-white">{f.buybackBps / 100}% buyback · {100 - f.buybackBps / 100}% {f.destWallet ? "fee wallet" : "—"}</span>
          </div>
          <input
            type="range"
            min={1000}
            max={10000}
            step={500}
            value={f.destWallet ? f.buybackBps : 10000}
            disabled={!f.destWallet}
            onChange={(e) => set("buybackBps", +e.target.value)}
            className="mt-2 w-full"
          />
          <p className="mt-1 text-[11px] text-muted">
            {fill(T.buybackNote, { years: VEST.vestYears, cut: VEST.protocolCutBps / 100, tbd: VEST.protocolCutTbd ? " (TBD)" : "" })}
          </p>
        </div>
      )}
      {f.destHolders && <Note>{T.holdersNote}</Note>}
    </div>
  );
}
