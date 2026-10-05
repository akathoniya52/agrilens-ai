import type { Severity } from "@/types/chat";

/** [longitude, latitude] — GeoJSON order. */
export type LngLat = [number, number];

export interface GeoPoint {
  type: "Point";
  coordinates: LngLat;
}

export interface GeoPolygon {
  type: "Polygon";
  /** Outer ring first; rings are closed (first === last). */
  coordinates: LngLat[][];
}

export const SOIL_TYPES = ["clay", "clay_loam", "loam", "sandy_loam", "sandy", "silt", "black", "red", "alluvial", "other"] as const;
export type SoilType = (typeof SOIL_TYPES)[number];

export const IRRIGATION_TYPES = ["rainfed", "drip", "sprinkler", "flood", "furrow", "other"] as const;
export type IrrigationType = (typeof IRRIGATION_TYPES)[number];

export const REMINDER_KINDS = ["irrigation", "fertilizer", "scouting", "spray", "harvest", "sowing", "weather", "custom"] as const;
export type ReminderKind = (typeof REMINDER_KINDS)[number];

export interface FarmDTO {
  _id: string;
  name: string;
  location: GeoPoint | null;
  crops: string[];
  areaHa: number | null;
  soilType: SoilType | null;
  irrigation: IrrigationType | null;
  fieldCount?: number;
  createdAt: string;
}

export interface FieldDTO {
  _id: string;
  farmId: string;
  name: string;
  crop: string;
  sowingDate: string | null;
  boundary: GeoPolygon | null;
  areaHa: number | null;
  createdAt: string;
}

export interface ReminderDTO {
  _id: string;
  farmId: string | null;
  fieldId: string | null;
  title: string;
  dueAt: string;
  kind: ReminderKind;
  done: boolean;
  notifiedAt: string | null;
  createdAt: string;
}

export interface DiagnosisPin {
  _id: string;
  fieldId: string | null;
  crop: string;
  condition: string;
  severity: Severity;
  confidence: number;
  location: GeoPoint | null;
  createdAt: string;
}

/** GET /api/farms/[farmId] */
export interface FarmDetail {
  farm: FarmDTO;
  fields: FieldDTO[];
  diagnoses: DiagnosisPin[];
}

/* ── Weather ─────────────────────────────────────────────────── */

export interface HourlyPoint {
  /** Local ISO time without offset, e.g. "2026-10-05T13:00". */
  time: string;
  /** Epoch ms (UTC). */
  ts: number;
  temp: number;
  rh: number;
  precip: number;
  wind: number;
  precipProb?: number | null;
}

export interface DailyPoint {
  date: string;
  code: number;
  tMax: number;
  tMin: number;
  precipSum: number;
  precipProb: number | null;
  windMax: number;
  /** Hours with leaf-wetness proxy (RH ≥ 90% or rain). */
  wetHours: number;
}

export interface CurrentWeather {
  time: string;
  temp: number;
  apparent: number;
  rh: number;
  precip: number;
  wind: number;
  code: number;
}

export type RiskLevel = "low" | "moderate" | "high";

export interface DayCriteria {
  date: string;
  minTemp: number;
  humidHours: number;
  qualifies: boolean;
}

export interface BlightRisk {
  level: RiskLevel;
  /** First day of the first full Hutton period, if any. */
  periodStart: string | null;
  days: DayCriteria[];
}

export interface SprayWindow {
  start: string;
  end: string;
  startTs: number;
  endTs: number;
  hours: number;
  avgWind: number;
  avgTemp: number;
}

/** GET /api/weather?farmId= */
export interface WeatherReport {
  location: { lat: number; lon: number };
  timezone: string;
  current: CurrentWeather;
  daily: DailyPoint[];
  risk: BlightRisk;
  windows: SprayWindow[];
  fetchedAt: string;
}

/* ── Dashboard ───────────────────────────────────────────────── */

export interface DashboardData {
  totals: { diagnoses: number; farms: number; fields: number; openReminders: number };
  overTime: Array<{ date: string } & Record<Severity, number>>;
  severity: Array<{ severity: Severity; count: number }>;
  topConditions: Array<{ condition: string; count: number }>;
  fieldHealth: Array<{ fieldId: string; name: string; crop: string; count: number; health: number; lastSeverity: Severity }>;
  gallery: Array<{ _id: string; fieldId: string | null; fieldName: string | null; condition: string; severity: Severity; createdAt: string; imageUrl: string }>;
}
