"use client";
import { useState } from "react";
import { parseEther, zeroAddress, zeroHash, type Address } from "viem";
import { usePublicClient, useWriteContract } from "wagmi";
import { content } from "@/lib/data";
import { launchFactoryAbi } from "@/lib/abis";
import { fill, fmtNum } from "@/lib/format";
import { useTx } from "@/providers/tx";
import { PageHeader } from "@/components/ui";
import { Empty } from "@/components/ui";
import { EconomicsStep, HoldersConfirm, IdentityStep, LaunchSidebar, LaunchTargetPicker, ReviewModal, Stepper, useLaunchForm } from "@/components/launch";
import { useCommunityCanary } from "@/lib/community-canary";
import { useDataSourceStatus } from "@/lib/indexer";

const T = content.launch.review;

export default function LaunchPage() {
  const tx = useTx();
  const publicClient = usePublicClient();
  const contractWrite = useWriteContract();
  const api = useLaunchForm();
  const canary = useCommunityCanary();
  const dataSource = useDataSourceStatus();
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const [holdersOpen, setHoldersOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  if (api.protocol.isLoading) {
    return (
      <div>
        <PageHeader title={content.launch.title} intro={content.launch.noAllocation} />
        <Empty title="Loading protocol configuration" body="Reading verified launch settings from the backend API." />
      </div>
    );
  }

  if (api.protocol.isError || !api.protocol.data?.configured) {
    return (
      <div>
        <PageHeader title={content.launch.title} intro={content.launch.noAllocation} />
        <Empty title="Protocol not configured" body={api.protocol.isError
          ? "The runtime protocol configuration could not be loaded from the backend API."
          : "Launch is disabled until verified contract addresses and the on-chain launch configuration are available."} />
      </div>
    );
  }

  const goToEconomics = () => {
    setShowErrors(true);
    if (api.identityOk) setStep(1);
  };

  const submit = () => {
    if (api.protocol.data?.capability !== "enabled" || dataSource.data?.writeSafe !== true || !canary.actionAllowed) {
      setReviewOpen(false);
      return;
    }
    const { ticker } = api.form;
    const factory = api.protocol.data?.contracts.factory;
    const attestationRequired = Boolean(api.protocol.data?.creatorAttestation.required);
    setReviewOpen(false);
    void tx.run({
      title: fill(T.txTitle, { ticker }),
      lines: [
        { label: T.launchFee, value: `${api.launchFeeHype} ${api.nativeSymbol}` },
        { label: T.openingBuy, value: api.opening ? `${fmtNum(api.opening, 4)} ${api.nativeSymbol}` : "—" },
        { label: T.txTotal, value: `${fmtNum(api.launchFeeHype + api.opening, 4)} ${api.nativeSymbol} + gas` },
      ],
      successTitle: fill(T.successTitle, { ticker }),
      successBody: T.successBody,
      wallet: api.walletAddress ?? undefined,
    }, async (requestId) => {
      if (!factory || !publicClient) throw new Error("Launch contract is not configured.");
      const identityEvidence = await api.uploadMetadata(requestId);
      const launchFee = api.protocol.data?.launchConfig.launchFeeHype;
      if (!launchFee) throw new Error("Launch fee is not configured.");
      const launchParams = {
        name: api.form.name.trim(),
        symbol: api.form.ticker,
        metadataURI: identityEvidence.metadataURI,
        quote: zeroAddress,
        feeRecipient: api.form.feeWallet as Address,
        creatorFeeBps: api.form.creatorFeeBps,
        feeDestination: { kind: 0, buybackBps: 0 },
        openingBuyHype: api.openingWei,
        openingBuyMinTokens: api.openingWei > 0n ? api.openingTokensOut * 99n / 100n : 0n,
      } as const;
      const value = parseEther(launchFee) + api.openingWei;
      if (attestationRequired && !api.xVerification.verified) {
        throw new Error("Connect and verify X before launching on this protected target.");
      }
      const signed = api.xVerification.verified
        ? await api.requestXAttestation(identityEvidence.metadataURI, identityEvidence.imageHash)
        : null;
      if (attestationRequired && !signed) {
        throw new Error("A valid cross-chain creator attestation is required.");
      }
      const hash = signed
        ? await (async () => {
          return contractWrite.writeContractAsync({
            address: factory,
            abi: launchFactoryAbi,
            functionName: "launchWithAttestation",
            args: [launchParams, {
              imageHash: identityEvidence.imageHash,
              socialHash: signed.attestation.socialHash,
              templateVersion: 1,
            }, {
              ...signed.attestation,
              nonce: BigInt(signed.attestation.nonce),
              deadline: BigInt(signed.attestation.deadline),
            }, signed.signature],
            value,
          });
        })()
        : await contractWrite.writeContractAsync({
        address: factory,
        abi: launchFactoryAbi,
        functionName: "launchWithIdentity",
        args: [launchParams, {
          imageHash: identityEvidence.imageHash,
          socialHash: zeroHash,
          templateVersion: 1,
        }],
        value,
      });
      return {
        hash,
        wait: async () => { await publicClient.waitForTransactionReceipt({ hash }); },
      };
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div>
        <PageHeader title={content.launch.title} intro={content.launch.noAllocation} />
        <LaunchTargetPicker />
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
