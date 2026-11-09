import { Footer, Header } from "@/components/header";
import { NetworkBanner } from "@/components/wallet-ui";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:bg-white focus:px-3 focus:py-2 focus:text-bg">Skip to content</a>
      <Header />
      <NetworkBanner />
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <Footer />
    </>
  );
}
