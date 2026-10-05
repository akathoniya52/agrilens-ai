import { cx } from "@/components/ui";

interface GaugeProps {
  label: string;
  value: number | null;
  min: number;
  max: number;
  unit: string;
  /** Tailwind text-* colour token for the arc. */
  tone?: string;
}

const R = 34;
const ARC = Math.PI * R;

export default function Gauge({ label, value, min, max, unit, tone = "text-accent" }: GaugeProps) {
  const pct = value === null ? 0 : Math.min(1, Math.max(0, (value - min) / (max - min)));
  return (
    <figure className="flex flex-col items-center rounded-2xl border border-border bg-surface px-2 pb-3 pt-2">
      <svg viewBox="0 0 84 48" className="w-full max-w-[120px]" role="img" aria-label={`${label}: ${value ?? "—"} ${unit}`}>
        <path d="M8 44 A34 34 0 0 1 76 44" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" className="text-surface-3" />
        <path
          d="M8 44 A34 34 0 0 1 76 44"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={ARC}
          strokeDashoffset={ARC * (1 - pct)}
          className={cx(tone, "transition-[stroke-dashoffset] duration-700")}
        />
      </svg>
      <div className="-mt-3 font-display text-lg font-bold text-fg">
        {value === null ? "—" : value.toFixed(value >= 10 ? 0 : 1)}
        <span className="ml-0.5 text-xs font-medium text-fg-subtle">{unit}</span>
      </div>
      <figcaption className="mt-0.5 text-center text-xs text-fg-muted">{label}</figcaption>
    </figure>
  );
}
