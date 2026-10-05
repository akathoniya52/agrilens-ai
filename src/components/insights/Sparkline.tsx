"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/components/ThemeProvider";
import { CHART_PALETTE } from "@/components/dashboard/chart-theme";

export interface SparkPoint {
  x: string;
  actual?: number | null;
  forecast?: number | null;
}

interface SparklineProps {
  data: SparkPoint[];
  height?: number;
  domain?: [number | "auto", number | "auto"];
  format?: (value: number) => string;
  label: string;
}

export default function Sparkline({ data, height = 96, domain = ["auto", "auto"], format = (v) => v.toFixed(2), label }: SparklineProps) {
  const { theme } = useTheme();
  const palette = CHART_PALETTE[theme];
  return (
    <div role="img" aria-label={label}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="x" hide />
          <YAxis hide domain={domain} />
          <Tooltip
            formatter={(value) => (typeof value === "number" ? format(value) : String(value))}
            contentStyle={{ background: palette.surface, border: `1px solid ${palette.grid}`, borderRadius: 12, color: palette.fg, fontSize: 12 }}
            labelStyle={{ color: palette.axis }}
          />
          <Line type="monotone" dataKey="actual" stroke={palette.accent} strokeWidth={2.2} dot={false} connectNulls isAnimationActive={false} />
          <Line type="monotone" dataKey="forecast" stroke={palette.axis} strokeWidth={1.8} strokeDasharray="4 4" dot={false} connectNulls isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
