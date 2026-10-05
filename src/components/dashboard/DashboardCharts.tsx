"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "motion/react";
import { useFormatter, useTranslations } from "next-intl";
import { useTheme } from "@/components/ThemeProvider";
import { EASE_FIELD } from "@/components/ui";
import type { DashboardData } from "@/types/farm";
import { CHART_PALETTE, SEVERITY_ORDER, type ChartPalette } from "./chart-theme";

function usePalette(): ChartPalette {
  const { theme } = useTheme();
  return CHART_PALETTE[theme];
}

const tooltipStyle = (p: ChartPalette) => ({
  contentStyle: { background: p.surface, border: `1px solid ${p.grid}`, borderRadius: 12, color: p.fg, fontSize: 12 },
  labelStyle: { color: p.fg, fontWeight: 600 },
  itemStyle: { color: p.fg },
});

export function OverTimeChart({ data }: { data: DashboardData["overTime"] }) {
  const p = usePalette();
  const tc = useTranslations("chat");
  const format = useFormatter();
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
        <defs>
          {SEVERITY_ORDER.map((s) => (
            <linearGradient key={s} id={`sev-${s}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={p.severity[s]} stopOpacity={0.7} />
              <stop offset="100%" stopColor={p.severity[s]} stopOpacity={0.08} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={p.grid} strokeDasharray="3 4" vertical={false} />
        <XAxis
          dataKey="date"
          stroke={p.axis}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(d: string) => format.dateTime(new Date(`${d}T12:00:00`), { day: "numeric", month: "short" })}
        />
        <YAxis stroke={p.axis} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tooltipStyle(p)} />
        {SEVERITY_ORDER.map((s) => (
          <Area
            key={s}
            type="monotone"
            dataKey={s}
            name={tc(`severity.${s}`)}
            stackId="sev"
            stroke={p.severity[s]}
            strokeWidth={2}
            fill={`url(#sev-${s})`}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function SeverityDonut({ data }: { data: DashboardData["severity"] }) {
  const p = usePalette();
  const tc = useTranslations("chat");
  const total = data.reduce((sum, d) => sum + d.count, 0);
  const rows = data.filter((d) => d.count > 0).map((d) => ({ ...d, name: tc(`severity.${d.severity}`) }));
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-44 w-44 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="count" nameKey="name" innerRadius="64%" outerRadius="100%" paddingAngle={2} stroke="none">
              {rows.map((r) => (
                <Cell key={r.severity} fill={p.severity[r.severity]} />
              ))}
            </Pie>
            <Tooltip {...tooltipStyle(p)} />
          </PieChart>
        </ResponsiveContainer>
        <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-bold text-fg">{total}</span>
        </span>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.severity} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.severity[d.severity] }} />
            <span className="flex-1 text-fg-muted">{tc(`severity.${d.severity}`)}</span>
            <span className="font-semibold text-fg">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TopConditionsChart({ data }: { data: DashboardData["topConditions"] }) {
  const p = usePalette();
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis type="category" dataKey="condition" width={130} stroke={p.axis} fontSize={12} tickLine={false} axisLine={false} />
        <Tooltip {...tooltipStyle(p)} cursor={{ fill: p.grid, opacity: 0.4 }} />
        <Bar dataKey="count" fill={p.accent} radius={[0, 8, 8, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function FieldHealthBars({ data }: { data: DashboardData["fieldHealth"] }) {
  const p = usePalette();
  return (
    <ul className="space-y-3">
      {data.map((f, i) => (
        <li key={f.fieldId}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium text-fg">
              {f.name} <span className="text-xs capitalize text-fg-subtle">· {f.crop}</span>
            </span>
            <span className="font-display font-semibold text-fg">{f.health}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full origin-left rounded-full"
              style={{ width: `${f.health}%`, background: p.severity[f.lastSeverity] }}
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.8, delay: i * 0.06, ease: EASE_FIELD }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
