"use client";

import { motion } from "motion/react";
import type { WeatherGroup } from "@/lib/weather";
import { cx } from "@/components/ui";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const CLOUD = "M7 18h10a4 4 0 0 0 .5-7.97A6 6 0 0 0 6 11a3.5 3.5 0 0 0 1 7z";

export default function WeatherGlyph({ group, size = 24, className }: { group: WeatherGroup; size?: number; className?: string }) {
  const sun = (
    <g className="origin-center motion-safe:animate-[spin_24s_linear_infinite] text-warning" style={{ transformBox: "fill-box" }}>
      <circle cx="12" cy="12" r="4" {...stroke} />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
        <path key={deg} d="M12 3v2" transform={`rotate(${deg} 12 12)`} {...stroke} />
      ))}
    </g>
  );
  const drops = (count: number, heavy: boolean) =>
    Array.from({ length: count }, (_, i) => (
      <motion.path
        key={i}
        d={heavy ? `M${8 + i * 4} 20l-1 3` : `M${8 + i * 4} 20v1.5`}
        className="text-info"
        initial={{ y: -2, opacity: 0 }}
        animate={{ y: 2, opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, repeat: Infinity, ease: "easeIn", delay: i * 0.25 }}
        {...stroke}
      />
    ));

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className={cx("overflow-visible", className)}>
      {group === "clear" && sun}
      {group === "partly" && (
        <>
          <g transform="translate(-3 -3) scale(0.8)">{sun}</g>
          <path d={CLOUD} transform="translate(2 2) scale(0.85)" className="text-fg-muted" {...stroke} />
        </>
      )}
      {(group === "cloudy" || group === "fog") && <path d={CLOUD} className="text-fg-muted" {...stroke} />}
      {group === "fog" && <path d="M5 21h14M7 23h10" className="text-fg-subtle" {...stroke} />}
      {(group === "drizzle" || group === "rain" || group === "storm") && (
        <>
          <path d={CLOUD} transform="translate(0 -3)" className="text-fg-muted" {...stroke} />
          {drops(group === "drizzle" ? 2 : 3, group !== "drizzle")}
        </>
      )}
      {group === "storm" && <path d="m13 14-2 4h3l-2 4" className="text-warning" {...stroke} />}
      {group === "snow" && (
        <>
          <path d={CLOUD} transform="translate(0 -3)" className="text-fg-muted" {...stroke} />
          <path d="M9 20h.01M12 22h.01M15 20h.01" className="text-info" {...stroke} strokeWidth={3} />
        </>
      )}
    </svg>
  );
}
