import { buildCropCalendar, resolveCropKey, type CropKey } from "@/lib/crop-calendar";
import type { Severity } from "@/types/chat";
import type { YieldEstimate } from "@/types/insights";

/** Typical Indian average yields (t/ha) — rough national figures, not field-calibrated. */
const BASE_YIELD_T_HA: Record<CropKey, number | null> = {
  wheat: 3.5,
  rice: 4.0,
  maize: 3.2,
  cotton: 1.5,
  tomato: 25,
  potato: 23,
  soybean: 1.1,
  sugarcane: 80,
  generic: null,
};

const SEVERITY_FACTOR: Record<Severity, number> = { none: 1, low: 0.96, moderate: 0.88, high: 0.75, critical: 0.6 };

export function ndviFactor(ndvi: number | null | undefined): number | null {
  if (ndvi === null || ndvi === undefined) return null;
  if (ndvi >= 0.7) return 1.08;
  if (ndvi >= 0.55) return 1;
  if (ndvi >= 0.4) return 0.9;
  if (ndvi >= 0.25) return 0.75;
  return 0.6;
}

export interface YieldInput {
  crop: string;
  areaHa: number | null;
  sowingDate: Date | string | null;
  /** Worst recent diagnosis severity on the field (last ~30 days). */
  recentSeverity?: Severity | null;
  ndvi?: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The calendar's harvest task (e.g. cotton's first picking), so both views agree; else the end of the last stage. */
function calendarHarvestDate(crop: string, sowingDate: Date | string): string | null {
  const calendar = buildCropCalendar(crop, sowingDate);
  return calendar.tasks.find((task) => task.kind === "harvest")?.date ?? calendar.stages.at(-1)?.endDate ?? null;
}

export function estimateYield({ crop, areaHa, sowingDate, recentSeverity, ndvi }: YieldInput): YieldEstimate {
  const cropKey = resolveCropKey(crop);
  const base = BASE_YIELD_T_HA[cropKey];
  const factors: YieldEstimate["factors"] = [];
  if (recentSeverity && recentSeverity !== "none") {
    factors.push({ key: "disease", label: `Recent ${recentSeverity} disease pressure`, multiplier: SEVERITY_FACTOR[recentSeverity] });
  }
  const vegetation = ndviFactor(ndvi);
  if (vegetation !== null && ndvi !== null && ndvi !== undefined) {
    factors.push({ key: "ndvi", label: `Satellite NDVI ${ndvi.toFixed(2)}`, multiplier: vegetation });
  }
  const harvestDate = sowingDate ? calendarHarvestDate(crop, sowingDate) : null;

  if (base === null) {
    return { crop, areaHa, perHa: null, total: null, low: null, high: null, harvestDate, factors, basis: "heuristic" };
  }
  const multiplier = factors.reduce((m, f) => m * f.multiplier, 1);
  const perHa = round2(base * multiplier);
  const total = areaHa ? round2(perHa * areaHa) : null;
  return {
    crop,
    areaHa,
    perHa,
    total,
    low: total !== null ? round2(total * 0.75) : null,
    high: total !== null ? round2(total * 1.2) : null,
    harvestDate,
    factors,
    basis: "heuristic",
  };
}
