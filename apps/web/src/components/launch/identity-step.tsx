"use client";
import { content } from "@/lib/data";
import { AffixInput, Badge, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { ImageUpload } from "./image-upload";
import type { LaunchFormApi } from "./use-launch-form";
import Link from "next/link";
import { shortAddr } from "@/lib/format";

const T = content.launch.form;
type SocialKey = "x" | "telegram" | "website";

interface IdentityStepProps {
  api: LaunchFormApi;
  showErrors: boolean;
  onContinue: () => void;
}

export function IdentityStep({ api, showErrors, onContinue }: IdentityStepProps) {
  const { form: f, set } = api;
  const err = (k: string) => (showErrors ? api.identityErrors[k] ?? null : null);

  return (
    <Card className="mt-4 p-5">
      <div className="grid gap-5 sm:grid-cols-[140px_1fr]">
        <ImageUpload value={f.image} error={err("image")} onChange={(v) => set("image", v)} />

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={T.name.label} error={err("name")} right={`${f.name.length}/32`}>
              <Input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={T.name.placeholder} />
            </Field>
            <Field label={T.ticker.label} error={err("ticker")}>
              <AffixInput
                prefix="$"
                className="uppercase"
                value={f.ticker}
                onChange={(e) => set("ticker", e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10))}
                placeholder={T.ticker.placeholder}
              />
            </Field>
          </div>

          {api.identityChecking && <p className="text-xs text-muted">Checking on-chain identity…</p>}
          {!api.identityChecking && api.identityCheck?.duplicate && api.identityCheck.available && (
            <p className="text-xs text-warn">
              An exact identity already exists. This launch will be marked as Copy.
              {api.identityCheck.originalToken && (
                <> <Link className="text-primary" href={`/token/${api.identityCheck.originalToken}`}>
                  View original {shortAddr(api.identityCheck.originalToken)} →
                </Link></>
              )}
            </p>
          )}
          {!api.identityChecking && api.identityCheck?.warnings?.map((warning) => (
            <p key={`${warning.type}-${warning.originalToken}`} className="text-xs text-warn">
              {warning.type === "cross-chain"
                ? `The same identity exists on ${warning.chain ?? "another chain"}. This warning does not block launch.`
                : "Possible look-alike detected. This warning does not block launch."} {" "}
              {warning.type !== "cross-chain" && (
                <Link className="text-primary" href={`/token/${warning.originalToken}`}>View token →</Link>
              )}
            </p>
          ))}

          <Field label={T.description.label} error={err("description")} right={`${f.description.length}/280`}>
            <Textarea rows={3} value={f.description} onChange={(e) => set("description", e.target.value)} placeholder={T.description.placeholder} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            {T.socials.map((s) => {
              const key = s.key as SocialKey;
              return (
                <Field key={key} label={s.label} error={err(key)}>
                  <Input value={f[key]} onChange={(e) => set(key, e.target.value)} placeholder={s.placeholder} />
                </Field>
              );
            })}
          </div>

          <div className="rounded-md border border-line bg-bg p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm text-white">
                  Creator verification
                  <Badge tone={api.xVerification.verified ? "mint" : "muted"}>
                    {api.xVerification.verified ? "Verified" : "Unverified"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {api.xVerification.verified
                    ? `Connected as @${api.xVerification.username}. Your cross-chain identity attestation is ready.`
                    : api.protocol.data?.creatorAttestation.required
                      ? "Connect X is required to enforce anti-vamp identity protection across every Squeez chain."
                      : "Optionally prove control of an X account. Launch remains available without it."}
                </p>
                {showErrors && api.identityErrors.xVerification && (
                  <p className="mt-1 text-xs text-warn">{api.identityErrors.xVerification}</p>
                )}
              </div>
              {api.xVerification.verified ? (
                <Button variant="secondary" onClick={() => void api.disconnectX()}>Disconnect X</Button>
              ) : api.protocol.data?.creatorAttestation.enabled ? (
                <Button loading={api.xVerificationLoading} onClick={() => void api.connectX()}>
                  {api.protocol.data?.creatorAttestation.required ? "Connect X — Required" : "Verify with X"}
                </Button>
              ) : (
                <Badge tone="muted">Coming soon</Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={onContinue}>{T.continue}</Button>
      </div>
    </Card>
  );
}
