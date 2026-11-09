import { config, landing as L } from "@/lib/data";
import { THRESHOLD } from "@/lib/curve";
import { IconArrowUpRight } from "@/components/icons";
import { ReactionField } from "../motion";
import { Container, CtaLink, KeyValueList, SectionLabel } from "../primitives";

const P = config.protocol;
const LC = config.launchConfig;

/** 008: big closing statement with the reaction field figure. */
export function CtaSection() {
  const C = L.cta;
  const field = L.figures.field;
  const rows = [...C.rows, { k: "Graduation", v: `${THRESHOLD} HYPE` }, { k: "Launch fee", v: `${P.launchFeeHype} HYPE` }];
  return (
    <section className="border-t border-line">
      <Container className="py-20 md:py-28">
        <SectionLabel tag={C.label} n={8} ruled={false} />
        <figure className="mt-10 border-y border-line">
          <div className="h-[34vh] min-h-[12rem] w-full md:h-[42vh]"><ReactionField word={field.word} /></div>
          <figcaption className="flex flex-wrap justify-between gap-2 border-t border-line py-3 text-xs">
            <span className="text-white"><span className="num text-muted">[ {field.label} ]</span> {field.title}</span>
            <span className="num text-muted">{field.meta}</span>
          </figcaption>
        </figure>
        <h2 data-reveal="line" className="mt-12 font-display font-extrabold text-white" style={{ fontSize: "clamp(3rem, 11vw, 10rem)" }}>
          <span className="wordmark block" style={{ lineHeight: 0.88 }}>{C.title}</span>
        </h2>
        <div className="mt-14 grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
          <div>
            <p className="max-w-xl text-lg leading-relaxed text-mint">{C.body}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <CtaLink href="/explore" arrow>{C.primary}</CtaLink>
              <CtaLink href={config.chain.faucet} variant="outline" external>{C.secondary}<IconArrowUpRight width={14} height={14} /></CtaLink>
            </div>
          </div>
          <KeyValueList rows={rows}>
            {(LC.graduationThresholdTbd || P.launchFeeTbd) && <p className="num pt-3 text-[11px] text-muted">* {C.placeholderNote}</p>}
          </KeyValueList>
        </div>
      </Container>
    </section>
  );
}
