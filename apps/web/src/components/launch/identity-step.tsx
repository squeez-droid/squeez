"use client";
import { content } from "@/lib/data";
import { AffixInput, Button, Card, Field, Input, Textarea } from "@/components/ui";
import { ImageUpload } from "./image-upload";
import type { LaunchFormApi } from "./use-launch-form";

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
        <ImageUpload value={f.image} ticker={f.ticker} error={err("image")} onChange={(v) => set("image", v)} />

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
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <Button size="lg" onClick={onContinue}>{T.continue}</Button>
      </div>
    </Card>
  );
}
