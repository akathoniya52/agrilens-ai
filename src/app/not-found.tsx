import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ChatIcon, HomeIcon } from "@/components/icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("notFound");
  return { title: `${t("metaTitle")} | AgriLens AI` };
}

/** Hand-drawn field: drifting clouds, a swaying scarecrow and sprouts that grow in. CSS-only, so reduced motion stops it. */
function LostInTheField() {
  return (
    <svg viewBox="0 0 400 260" className="h-auto w-full" role="img" aria-hidden>
      <defs>
        <linearGradient id="nf-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent)" stopOpacity="0.12" />
          <stop offset="1" stopColor="var(--color-accent)" stopOpacity="0" />
        </linearGradient>
        <clipPath id="nf-frame">
          <rect width="400" height="260" rx="28" />
        </clipPath>
      </defs>
      <g clipPath="url(#nf-frame)">
        <rect width="400" height="260" fill="url(#nf-sky)" />

        {/* Sun */}
        <circle cx="320" cy="62" r="22" fill="var(--color-harvest)" opacity="0.85" />
        <circle cx="320" cy="62" r="34" fill="var(--color-harvest)" opacity="0.15" />

        {/* Clouds */}
        <g className="animate-drift" style={{ animationDuration: "46s" }} fill="var(--color-fg-subtle)" opacity="0.35">
          <ellipse cx="60" cy="54" rx="34" ry="12" />
          <ellipse cx="80" cy="46" rx="22" ry="12" />
        </g>
        <g className="animate-drift" style={{ animationDuration: "64s", animationDelay: "-30s" }} fill="var(--color-fg-subtle)" opacity="0.22">
          <ellipse cx="40" cy="96" rx="26" ry="9" />
          <ellipse cx="56" cy="90" rx="16" ry="9" />
        </g>

        {/* Rolling field rows */}
        <path d="M0 200 Q100 176 200 190 T400 182 V260 H0z" fill="var(--color-surface-3)" />
        <path d="M0 222 Q120 204 220 214 T400 208 V260 H0z" fill="var(--color-border)" />
        <g stroke="var(--color-border-strong)" strokeWidth="2" strokeLinecap="round" opacity="0.6">
          <path d="M30 240 Q110 226 200 232" fill="none" />
          <path d="M210 246 Q300 232 390 236" fill="none" />
        </g>

        {/* Scarecrow */}
        <g className="animate-sway" style={{ transformOrigin: "200px 214px", transformBox: "view-box" }}>
          <path d="M200 214V96" stroke="var(--color-fg-subtle)" strokeWidth="5" strokeLinecap="round" />
          <path d="M150 128H250" stroke="var(--color-fg-subtle)" strokeWidth="5" strokeLinecap="round" />
          <path d="M176 122h48l-6 52h-36z" fill="var(--color-harvest)" opacity="0.9" />
          <path d="M184 138h32M186 152h28" stroke="var(--color-surface)" strokeWidth="2" opacity="0.5" />
          <path d="M150 128l-10 12M150 128l-12 4M250 128l10 12M250 128l12 4" stroke="var(--color-harvest)" strokeWidth="3" strokeLinecap="round" />
          <circle cx="200" cy="100" r="16" fill="var(--color-surface-2)" stroke="var(--color-fg-subtle)" strokeWidth="3" />
          <path d="M193 98h.01M207 98h.01" stroke="var(--color-fg)" strokeWidth="4" strokeLinecap="round" />
          <path d="M194 108q6-4 12 0" stroke="var(--color-fg)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M178 86h44l-8-16h-28z" fill="var(--color-accent)" />
          <path d="M172 88h56" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" />
          {/* "?" */}
          <text x="226" y="84" fontFamily="var(--font-display)" fontSize="22" fontWeight="700" fill="var(--color-accent)" className="animate-float">
            ?
          </text>
        </g>

        {/* Sprouts */}
        {[
          { x: 70, y: 214, d: "0.2s" },
          { x: 118, y: 206, d: "0.5s" },
          { x: 290, y: 206, d: "0.8s" },
          { x: 342, y: 212, d: "1.1s" },
        ].map(({ x, y, d }) => (
          <g key={x} className="animate-rise" style={{ animationDelay: d, transformBox: "fill-box", transformOrigin: "bottom" }}>
            <path d={`M${x} ${y}v-18`} stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
            <path d={`M${x} ${y - 12}c-2-7-8-10-14-9 0 7 6 10 14 9z`} fill="var(--color-accent)" />
            <path d={`M${x} ${y - 16}c2-7 8-10 14-9 0 7-6 10-14 9z`} fill="var(--color-accent)" opacity="0.8" />
          </g>
        ))}
      </g>
    </svg>
  );
}

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <main className="relative isolate flex min-h-[calc(100dvh-56px)] items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="aurora opacity-50" />
        <div className="grain absolute inset-0" />
      </div>
      <div className="w-full max-w-lg text-center">
        <div className="animate-rise rounded-[2rem] border border-border bg-surface-2/70 p-2 shadow-raised backdrop-blur">
          <LostInTheField />
        </div>
        <p className="mt-8 animate-rise font-display text-sm font-semibold uppercase tracking-[0.3em] text-accent [animation-delay:100ms]">404</p>
        <h1 className="mt-2 animate-rise font-display text-4xl font-bold text-fg [animation-delay:160ms] sm:text-5xl">{t("title")}</h1>
        <p className="mx-auto mt-3 max-w-md animate-rise text-fg-muted [animation-delay:220ms]">{t("body")}</p>
        <div className="mt-8 flex animate-rise flex-col justify-center gap-3 [animation-delay:280ms] sm:flex-row">
          <Link
            href="/"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-6 font-semibold text-accent-fg shadow-glow transition hover:brightness-110"
          >
            <HomeIcon width={18} height={18} />
            {t("home")}
          </Link>
          <Link
            href="/chat"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border-strong px-6 font-semibold text-fg transition-colors hover:bg-surface-3"
          >
            <ChatIcon width={18} height={18} />
            {t("chat")}
          </Link>
        </div>
      </div>
    </main>
  );
}
