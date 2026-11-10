import type { Metadata } from "next";
import { Archivo, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/providers";
import { WalletModal } from "@/components/wallet-ui";
import { Toasts, TxModal } from "@/components/tx-ui";
import { content } from "@/lib/data";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
// Display: wide Archivo (wdth 125) for headings & big numbers, ticker-board feel.
const display = Archivo({ subsets: ["latin"], variable: "--font-display", axes: ["wdth"] });

export const metadata: Metadata = {
  title: `${content.brand.name} · Launchpad on Elysium`,
  description: content.brand.tagline,
  icons: {
    icon: [{ url: "/squeez-logo.png", type: "image/png" }],
    shortcut: "/squeez-logo.png",
    apple: "/squeez-logo.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} ${display.variable}`}>
      <body className="min-h-dvh font-sans">
        <Providers>
          {children}
          <WalletModal />
          <TxModal />
          <Toasts />
        </Providers>
      </body>
    </html>
  );
}
