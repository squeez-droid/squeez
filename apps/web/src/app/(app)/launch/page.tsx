"use client";
import { useState } from "react";
import { config, content } from "@/lib/data";
import { fill, fmtNum } from "@/lib/format";
import { useTx } from "@/providers/tx";
import { PageHeader } from "@/components/ui";
import { Empty } from "@/components/ui";
import { EconomicsStep, HoldersConfirm, IdentityStep, LaunchSidebar, ReviewModal, Stepper, useLaunchForm } from "@/components/launch";

const P = config.protocol;
const T = content.launch.review;

export default function LaunchPage() {
  const tx = useTx();
  const api = useLaunchForm();
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [holdersOpen, setHoldersOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  if (!config.configured) {
    return (
      <div>
        <PageHeader title={content.launch.title} intro={content.launch.noAllocation} />
        <Empty title="Protocol not configured" body="Launch is disabled until verified contract addresses and the on-chain launch configuration are available." />
      </div>
    );
  }

  const goToEconomics = () => {
    setShowErrors(true);
    if (api.identityOk) setStep(1);
  };

  const submit = () => {
    const { ticker } = api.form;
    setReviewOpen(false);
    tx.run({
      title: fill(T.txTitle, { ticker }),
      lines: [
        { label: T.launchFee, value: `${P.launchFeeHype} HYPE` },
        { label: T.openingBuy, value: api.opening ? `${fmtNum(api.opening, 4)} HYPE` : "—" },
        { label: T.txTotal, value: `${fmtNum(P.launchFeeHype + api.opening, 4)} HYPE + gas` },
      ],
      successTitle: fill(T.successTitle, { ticker }),
      successBody: T.successBody,
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <PageHeader title={content.launch.title} intro={content.launch.noAllocation} />
        <Stepper step={step} canAdvance={api.identityOk} onSelect={setStep} onBlocked={() => setShowErrors(true)} />

        {step === 0 && <IdentityStep api={api} showErrors={showErrors} onContinue={goToEconomics} />}
        {step === 1 && (
          <EconomicsStep api={api} onBack={() => setStep(0)} onReview={() => setReviewOpen(true)} onRequestHolders={() => setHoldersOpen(true)} />
        )}
      </div>

      <LaunchSidebar api={api} />

      <HoldersConfirm
        open={holdersOpen}
        onClose={() => setHoldersOpen(false)}
        onConfirm={() => {
          api.enableHolders();
          setHoldersOpen(false);
        }}
      />
      <ReviewModal api={api} open={reviewOpen} onClose={() => setReviewOpen(false)} onSubmit={submit} />
    </div>
  );
}
