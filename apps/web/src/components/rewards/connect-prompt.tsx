"use client";
import { config, content } from "@/lib/data";
import { fill } from "@/lib/format";
import { useWallet } from "@/providers/wallet";
import { Button, Empty, PageHeader } from "@/components/ui";

const T = content.rewards;

/** Shown when no wallet is connected or the wallet is on the wrong network. */
export function ConnectPrompt() {
  const w = useWallet();
  const wrongNetwork = w.status === "wrong-network";
  return (
    <div className="mx-auto max-w-xl py-10">
      <PageHeader title={T.title} />
      <div className="mt-6">
        <Empty
          title={wrongNetwork ? fill(T.wrongNetwork, { chain: config.chain.name }) : T.notConnected}
          body={T.connectPrompt}
          action={
            wrongNetwork
              ? <Button variant="danger" onClick={w.switchNetwork}>{T.switchNetwork}</Button>
              : <Button loading={w.status === "connecting"} onClick={w.openModal}>{T.connect}</Button>
          }
        />
      </div>
    </div>
  );
}
