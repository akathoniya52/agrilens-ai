import type { BoundingBox, Diagnosis, Severity } from "@/types/chat";

const SEVERITIES: readonly Severity[] = ["none", "low", "moderate", "high", "critical"];
const GEMINI_BOX_SCALE = 1000;

/** Untrusted model output; every field is validated during normalization. */
export interface RawBox {
  label?: unknown;
  confidence?: unknown;
  /** Gemini convention: [ymin, xmin, ymax, xmax] scaled to 0–1000. */
  box_2d?: unknown;
}

export interface RawDiagnosis {
  crop?: unknown;
  condition?: unknown;
  confidence?: unknown;
  severity?: unknown;
  affectedAreaPct?: unknown;
  boxes?: unknown;
}

const asString = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeConfidence(value: unknown): number {
  if (!isFiniteNumber(value)) return 0;
  return clamp(value > 1 ? value / 100 : value, 0, 1);
}

function normalizeSeverity(value: unknown): Severity {
  const severity = typeof value === "string" ? value.toLowerCase().trim() : "";
  return SEVERITIES.find((s) => s === severity) ?? "none";
}

export function normalizeBox(raw: RawBox): BoundingBox | null {
  const coords = raw.box_2d;
  if (!Array.isArray(coords) || coords.length !== 4) return null;
  if (!coords.every(isFiniteNumber)) return null;

  const [y1, x1, y2, x2] = coords.map((n: number) => clamp(n, 0, GEMINI_BOX_SCALE) / GEMINI_BOX_SCALE);
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.abs(x2 - x1);
  const h = Math.abs(y2 - y1);
  if (w === 0 || h === 0) return null;

  return {
    label: asString(raw.label) || "Affected area",
    confidence: normalizeConfidence(raw.confidence),
    x,
    y,
    w,
    h,
  };
}

export function normalizeDiagnosis(raw: RawDiagnosis | null | undefined): Diagnosis | null {
  if (!raw) return null;
  const crop = asString(raw.crop);
  const condition = asString(raw.condition);
  if (!crop && !condition) return null;

  const area = isFiniteNumber(raw.affectedAreaPct) ? clamp(raw.affectedAreaPct, 0, 100) : 0;
  const boxes = Array.isArray(raw.boxes) ? raw.boxes : [];

  return {
    crop: crop || "Unknown",
    condition: condition || "Unknown",
    confidence: normalizeConfidence(raw.confidence),
    severity: normalizeSeverity(raw.severity),
    affectedAreaPct: area,
    boxes: boxes
      .filter((box): box is RawBox => typeof box === "object" && box !== null)
      .map(normalizeBox)
      .filter((box): box is BoundingBox => box !== null),
  };
}
