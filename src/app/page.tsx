import type { ComponentType, SVGProps } from "react";
import { getTranslations } from "next-intl/server";
import HeroCta from "@/components/landing/HeroCta";
import ScanHero from "@/components/landing/ScanHero";
import { AnimatedCounter, ConfidenceRing, GlowCard, SeverityMeter, Stagger, StaggerItem, cx } from "@/components/ui";
import {
  BoltIcon,
  CameraIcon,
  ChatIcon,
  CloudRainIcon,
  GlobeIcon,
  MapIcon,
  MicIcon,
  SproutMark,
  WifiOffIcon,
} from "@/components/icons";
import { LANGUAGES } from "@/lib/languages";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

const FEATURES: { key: "diagnosis" | "streaming" | "voice" | "languages" | "weather" | "map" | "offline"; Icon: Icon; span: string; soon?: boolean }[] = [
  { key: "diagnosis", Icon: CameraIcon, span: "md:col-span-2 lg:row-span-2" },
  { key: "streaming", Icon: BoltIcon, span: "" },
  { key: "voice", Icon: MicIcon, span: "" },
  { key: "languages", Icon: GlobeIcon, span: "md:col-span-2" },
  { key: "weather", Icon: CloudRainIcon, span: "", soon: true },
  { key: "map", Icon: MapIcon, span: "", soon: true },
  { key: "offline", Icon: WifiOffIcon, span: "md:col-span-2 lg:col-span-2", soon: true },
];

const STATS = [
  { key: "diseases", value: 38, suffix: "+" },
  { key: "languages", value: 10 },
  { key: "crops", value: 14 },
  { key: "seconds", value: 5, prefix: "<" },
] as const;

const STEPS = ["snap", "read", "act"] as const;
const QUESTIONS = ["q1", "q2", "q3", "q4", "q5", "q6"] as const;

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
      <h2 className="font-display text-3xl font-semibold text-fg sm:text-4xl md:text-5xl">{title}</h2>
      {subtitle && <p className="mt-3 text-base text-fg-muted sm:text-lg">{subtitle}</p>}
    </div>
  );
}

function FeatureVisual({ feature }: { feature: (typeof FEATURES)[number]["key"] }) {
  if (feature === "diagnosis") {
    return (
      <div className="mt-8 flex flex-wrap items-center gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
        <ConfidenceRing value={0.92} size={72} strokeWidth={6} />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            <SeverityMeter severity="none" />
            <SeverityMeter severity="moderate" />
            <SeverityMeter severity="critical" />
          </div>
          <SeverityMeter severity="moderate" variant="bar" />
        </div>
      </div>
    );
  }
  if (feature === "streaming") {
    return (
      <div aria-hidden className="mt-6 space-y-2">
        {["w-full", "w-11/12", "w-2/3"].map((w, i) => (
          <div key={w} className={cx("h-2.5 rounded-full bg-surface-3", w)}>
            <div className="h-full origin-left animate-[grow-x_2.4s_var(--ease-field)_infinite] rounded-full bg-accent/50" style={{ animationDelay: `${i * 0.35}s` }} />
          </div>
        ))}
      </div>
    );
  }
  if (feature === "voice") {
    return (
      <div aria-hidden className="mt-6 flex h-10 items-center gap-1">
        {[0.4, 0.8, 0.55, 1, 0.65, 0.9, 0.45, 0.75, 0.5, 0.85, 0.35, 0.6].map((h, i) => (
          <span
            key={i}
            className="w-1.5 origin-center animate-[eq_1.1s_ease-in-out_infinite] rounded-full bg-accent"
            style={{ height: `${h * 100}%`, animationDelay: `${i * 0.08}s` }}
          />
        ))}
      </div>
    );
  }
  if (feature === "languages") {
    return (
      <ul className="mt-6 flex flex-wrap gap-2">
        {LANGUAGES.map((l) => (
          <li key={l.code} lang={l.code} className="rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-fg-muted">
            {l.nativeLabel}
          </li>
        ))}
      </ul>
    );
  }
  return null;
}

export default async function HomePage() {
  const t = await getTranslations("landing");
  const tc = await getTranslations("chat");

  return (
    <main className="overflow-x-clip">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative isolate px-4 pb-20 pt-12 sm:px-6 sm:pt-16 lg:px-8 lg:pb-28 lg:pt-24">
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="aurora" />
          <div className="aurora aurora-2" />
          <div className="field-rows absolute inset-0" />
          <div className="grain absolute inset-0" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-surface to-transparent" />
        </div>

        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="text-center lg:col-span-5 lg:text-left">
            <p className="inline-flex animate-rise items-center gap-2 rounded-full border border-accent/30 bg-accent-soft px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-accent sm:text-sm">
              <SproutMark width={16} height={16} strokeWidth={2.2} />
              {t("eyebrow")}
            </p>
            <h1 className="mt-6 animate-rise font-display text-[2.6rem] font-bold leading-[1.02] text-fg [animation-delay:80ms] sm:text-6xl lg:text-[4.5rem]">
              {t.rich("title", {
                accent: (chunks) => (
                  <span className="relative whitespace-nowrap text-accent">
                    {chunks}
                    <svg aria-hidden viewBox="0 0 200 12" preserveAspectRatio="none" className="absolute -bottom-1 left-0 h-3 w-full text-harvest">
                      <path d="M2 9c40-6 80-7 196-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                  </span>
                ),
              })}
            </h1>
            <p className="mx-auto mt-6 max-w-xl animate-rise text-lg leading-relaxed text-fg-muted [animation-delay:160ms] lg:mx-0">
              {t("subtitle")}
            </p>
            <HeroCta className="mt-8 animate-rise justify-center [animation-delay:240ms] lg:justify-start" />
            <p className="mt-5 animate-rise text-sm text-fg-subtle [animation-delay:320ms]">{t("trust")}</p>
          </div>

          <div className="lg:col-span-7 lg:-mr-10 xl:-mr-20">
            <ScanHero
              alt={t("scan.alt")}
              labels={{
                live: t("scan.live"),
                analyzing: t("scan.analyzing"),
                done: t("scan.done"),
                box1: t("scan.box1"),
                box2: t("scan.box2"),
                box3: t("scan.box3"),
                confidence: tc("confidence"),
              }}
            />
          </div>
        </div>
      </section>

      {/* ── Counters ─────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-8">
        <dl className="mx-auto grid max-w-5xl grid-cols-2 overflow-hidden rounded-3xl border border-border bg-surface-2 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div
              key={s.key}
              className={cx(
                "flex flex-col-reverse items-center gap-1 px-4 py-7 text-center sm:py-9",
                i % 2 === 1 && "border-l border-border",
                i >= 2 && "border-t border-border md:border-t-0",
                i === 2 && "md:border-l"
              )}
            >
              <dt className="text-sm font-medium text-fg-subtle">{t(`stats.${s.key}`)}</dt>
              <dd className="font-display text-4xl font-bold text-fg sm:text-5xl">
                <AnimatedCounter
                  value={s.value}
                  prefix={"prefix" in s ? s.prefix : ""}
                  suffix={"suffix" in s ? s.suffix : ""}
                />
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ── Features ─────────────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("features.title")} subtitle={t("features.subtitle")} />
          <Stagger className="grid auto-rows-fr gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5" stagger={0.07}>
            {FEATURES.map(({ key, Icon, span, soon }) => (
              <StaggerItem key={key} className={span}>
                <GlowCard className="flex h-full flex-col p-6 sm:p-7">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent ring-1 ring-accent/20">
                      <Icon width={22} height={22} />
                    </span>
                    {soon && (
                      <span className="rounded-full border border-harvest/40 bg-harvest/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-warning">
                        {t("features.soon")}
                      </span>
                    )}
                  </div>
                  <h3 className={cx("mt-5 font-display font-semibold text-fg", key === "diagnosis" ? "text-2xl sm:text-3xl" : "text-xl")}>
                    {t(`features.${key}.title`)}
                  </h3>
                  <p className="mt-2 leading-relaxed text-fg-muted">{t(`features.${key}.body`)}</p>
                  <div className="mt-auto">
                    <FeatureVisual feature={key} />
                  </div>
                </GlowCard>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="relative border-y border-border bg-surface-2 px-4 py-20 sm:px-6 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <SectionHeading title={t("how.title")} />
          <Stagger className="relative grid gap-10 md:grid-cols-3 md:gap-8" stagger={0.15}>
            <div aria-hidden className="absolute left-[16%] right-[16%] top-8 hidden border-t-2 border-dashed border-border-strong md:block" />
            {STEPS.map((step, i) => (
              <StaggerItem key={step} className="relative text-center">
                <span className="relative mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-border-strong bg-surface font-display text-2xl font-bold text-accent shadow-raised">
                  {i + 1}
                </span>
                <h3 className="mt-5 font-display text-xl font-semibold text-fg">{t(`how.${step}.title`)}</h3>
                <p className="mx-auto mt-2 max-w-xs leading-relaxed text-fg-muted">{t(`how.${step}.body`)}</p>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── Example questions ────────────────────────────── */}
      <section className="px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="mx-auto max-w-4xl">
          <SectionHeading title={t("questions.title")} subtitle={t("questions.subtitle")} />
          <Stagger className="grid gap-3 sm:grid-cols-2" stagger={0.05}>
            {QUESTIONS.map((q, i) => (
              <StaggerItem
                key={q}
                className={cx(
                  "flex min-h-14 items-center gap-3 rounded-2xl border border-border bg-surface-2 px-4 py-3.5 text-fg-muted",
                  i % 2 === 0 ? "rounded-bl-md" : "rounded-br-md"
                )}
              >
                <ChatIcon width={18} height={18} className="shrink-0 text-accent" />
                <span>{t(`questions.${q}`)}</span>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
        <div className="relative isolate mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-border-strong bg-surface-2 px-6 py-14 text-center sm:px-12 sm:py-20">
          <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
            <div className="aurora" />
            <div className="grain absolute inset-0" />
          </div>
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-semibold text-fg sm:text-5xl">{t("cta.title")}</h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-fg-muted">{t("cta.subtitle")}</p>
          <HeroCta variant="cta" className="mt-8 justify-center" />
        </div>
      </section>

      <footer className="border-t border-border px-4 py-8 text-center text-sm text-fg-subtle">
        <span className="inline-flex items-center gap-2">
          <SproutMark width={16} height={16} className="text-accent" />
          AgriLens AI · {t("footer")}
        </span>
      </footer>
    </main>
  );
}
