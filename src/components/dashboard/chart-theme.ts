import type { Theme } from "@/components/theme";
import type { Severity } from "@/types/chat";

export interface ChartPalette {
  grid: string;
  axis: string;
  fg: string;
  surface: string;
  accent: string;
  severity: Record<Severity, string>;
}

/** Mirrors the semantic tokens in globals.css — SVG presentation attributes can't resolve CSS variables. */
export const CHART_PALETTE: Record<Theme, ChartPalette> = {
  dark: {
    grid: "#26302a",
    axis: "#8a9a8e",
    fg: "#eef2ec",
    surface: "#111712",
    accent: "#4ade80",
    severity: { none: "#4ade80", low: "#a3e635", moderate: "#fbbf24", high: "#fb923c", critical: "#f87171" },
  },
  daylight: {
    grid: "#d8d0b8",
    axis: "#4a5443",
    fg: "#12160f",
    surface: "#fffdf7",
    accent: "#14532d",
    severity: { none: "#14532d", low: "#3f6212", moderate: "#8a3c0c", high: "#9a3412", critical: "#9f1c1c" },
  },
};

export const SEVERITY_ORDER: Severity[] = ["none", "low", "moderate", "high", "critical"];
