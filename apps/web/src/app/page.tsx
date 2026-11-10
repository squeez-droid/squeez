import { landing as L } from "@/lib/data";
import { Loader, Reveal } from "@/components/landing/motion";
import { Container } from "@/components/landing/primitives";
import {
  AnatomySection,
  CtaSection,
  FeesSection,
  HeroSection,
  LandingFooter,
  LandingHeader,
  LiveTokensSection,
  MechanismSection,
  PairsSection,
  ProtectionSection,
  RouteSection,
} from "@/components/landing/sections";

const sectionSpacing = "py-20 md:py-28";

export default function Landing() {
  return (
    <div className="min-h-dvh bg-bg text-white">
      <a
        href="#main"
        className="fixed left-4 top-4 z-[100] -translate-y-24 bg-white px-4 py-2 text-sm font-medium text-bg transition-transform focus:translate-y-0"
      >
        {L.skipLink}
      </a>

      <Loader label={L.motion.loaderLabel} />
      <Reveal />
      <LandingHeader />

      <main id="main">
        <HeroSection />
        <Container className={sectionSpacing}><RouteSection /></Container>
        <Container className={sectionSpacing}><MechanismSection /></Container>
        <Container className={sectionSpacing}><LiveTokensSection /></Container>
        <Container className={sectionSpacing}><AnatomySection /></Container>
        <Container className={sectionSpacing}><FeesSection /></Container>
        <Container className={sectionSpacing}><PairsSection /></Container>
        <Container className={sectionSpacing}><ProtectionSection /></Container>
        <CtaSection />
      </main>

      <LandingFooter />
    </div>
  );
}
