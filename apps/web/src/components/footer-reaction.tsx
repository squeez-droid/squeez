"use client";

import { landing as L } from "@/lib/data";
import { ReactionField } from "@/components/landing/motion";

export function FooterReaction() {
  const field = L.figures.field;
  return (
    <figure className="border-b border-line">
      <div className="h-40 w-full md:h-56"><ReactionField word={field.word} cell={4} /></div>
      <figcaption className="mx-auto flex max-w-7xl flex-wrap justify-between gap-2 px-4 py-3 text-xs">
        <span className="text-white"><span className="num text-muted">[ {field.label} ]</span> {field.title}</span>
        <span className="num text-muted">{field.meta}</span>
      </figcaption>
    </figure>
  );
}
