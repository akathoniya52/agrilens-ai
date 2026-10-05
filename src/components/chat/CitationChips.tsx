"use client";

import { useTranslations } from "next-intl";
import type { Citation } from "@/types/chat";

const chip =
  "inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-fg-muted transition-colors";

export default function CitationChips({ citations }: { citations: Citation[] }) {
  const t = useTranslations("chat");
  if (!citations.length) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label={t("sources")}>
      <span className="text-xs font-semibold uppercase tracking-wide text-fg-subtle">{t("sources")}</span>
      {citations.map((c) => {
        const body = (
          <>
            <span className="font-semibold text-accent">[{c.n}]</span>
            <span className="truncate">{c.title}</span>
          </>
        );
        return c.url ? (
          <a key={c.n} href={c.url} target="_blank" rel="noopener noreferrer" title={c.source} className={`${chip} hover:border-accent/50 hover:text-fg`}>
            {body}
          </a>
        ) : (
          <span key={c.n} title={c.source} className={chip}>
            {body}
          </span>
        );
      })}
    </div>
  );
}
