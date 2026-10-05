import type { Severity } from "@/types/chat";
import type { LngLat } from "@/types/farm";

/* ── NDVI (Sentinel-2) ───────────────────────────────────────── */

export interface NdviPoint {
  /** Interval start (ISO date). */
  date: string;
  mean: number;
  min: number;
  max: number;
  /** Share of valid (cloud-free) pixels, 0–1. */
  coverage: number;
}

export type NdviResult =
  | { status: "ok"; mean: number; latestDate: string; change: number | null; series: NdviPoint[]; imageAvailable: boolean }
  | { status: "not_configured" }
  | { status: "no_boundary" }
  | { status: "no_data" };

/* ── IoT sensors ─────────────────────────────────────────────── */

export interface SensorReadingDTO {
  ts: string;
  soilMoisture: number | null;
  soilTemp: number | null;
  airTemp: number | null;
  humidity: number | null;
  battery: number | null;
  deviceId: string | null;
}

export interface SensorSnapshot {
  connected: boolean;
  latest: SensorReadingDTO | null;
  recent: SensorReadingDTO[];
}

/* ── Market prices ───────────────────────────────────────────── */

export interface PricePoint {
  date: string;
  /** ₹ per quintal. */
  modal: number;
  min: number;
  max: number;
  markets: number;
}

export interface PriceTrend {
  direction: "up" | "down" | "flat";
  /** ₹/quintal per day from a least-squares fit. */
  slopePerDay: number;
  changePct: number | null;
  movingAverage: number | null;
  forecast: Array<{ date: string; modal: number }>;
}

export type MarketResult =
  | {
      status: "ok";
      commodity: string;
      state: string | null;
      district: string | null;
      latest: PricePoint | null;
      series: PricePoint[];
      trend: PriceTrend;
      markets: Array<{ market: string; district: string; modal: number; date: string }>;
    }
  | { status: "not_configured"; commodity: string }
  | { status: "no_data"; commodity: string };

/* ── Yield estimate ──────────────────────────────────────────── */

export interface YieldEstimate {
  crop: string;
  areaHa: number | null;
  /** t/ha */
  perHa: number | null;
  /** tonnes */
  total: number | null;
  low: number | null;
  high: number | null;
  harvestDate: string | null;
  factors: Array<{ key: string; label: string; multiplier: number }>;
  basis: "heuristic";
}

/* ── Outbreak radar ──────────────────────────────────────────── */

export interface OutbreakCell {
  id: string;
  /** Cell centre, rounded to the grid — never an exact farm location. */
  center: LngLat;
  condition: string;
  crop: string;
  /** Banded report count, e.g. "5–9", "10–24", "25+". */
  cases: string;
  users: number;
  severity: Severity;
  /** Start (Monday, ISO date) of the week of the latest report. */
  latest: string;
}

export interface OutbreakResponse {
  center: LngLat | null;
  radiusKm: number;
  days: number;
  k: number;
  cellDeg: number;
  cells: OutbreakCell[];
}

/* ── Expert cases ────────────────────────────────────────────── */

export type CaseStatus = "open" | "assigned" | "resolved";

export interface CaseNote {
  author: string;
  role: "farmer" | "expert";
  text: string;
  at: string;
}

export interface CaseDTO {
  _id: string;
  chatId: string;
  messageId: string;
  status: CaseStatus;
  question: string;
  answer: string;
  imageUrls: string[];
  diagnosis: { crop: string; condition: string; severity: Severity; confidence: number } | null;
  assignedTo: string | null;
  notes: CaseNote[];
  owner?: { name: string | null; email: string };
  createdAt: string;
  updatedAt: string;
}
