"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/chain";
import { WalletProvider } from "./wallet";
import { TxProvider } from "./tx";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <WalletProvider>
          <TxProvider>{children}</TxProvider>
        </WalletProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
