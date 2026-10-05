export interface OnDevicePrediction {
  label: string;
  crop: string;
  condition: string;
  healthy: boolean;
  /** 0–1 */
  confidence: number;
}

/** Accepts `["a", "b"]` or `{ "0": "a", "1": "b" }` (Keras class_indices inverted). */
export function parseLabels(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw === "object" && raw !== null) {
    return Object.entries(raw)
      .filter(([k]) => /^\d+$/.test(k))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, v]) => String(v));
  }
  return [];
}

const tidy = (s: string) =>
  s
    .replace(/_/g, " ")
    .replace(/\s*\(\s*/g, " (")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

/** PlantVillage style "Tomato___Late_blight" → { crop: "Tomato", condition: "Late blight" }. */
export function formatLabel(label: string): Pick<OnDevicePrediction, "crop" | "condition" | "healthy"> {
  const [rawCrop, rawCondition] = label.includes("___") ? label.split("___", 2) : ["", label];
  const crop = tidy(rawCrop);
  const condition = tidy(rawCondition);
  const healthy = /^healthy$/i.test(condition);
  return { crop, condition: healthy ? "Healthy" : condition.charAt(0).toUpperCase() + condition.slice(1), healthy };
}

export function softmax(values: number[]): number[] {
  const max = Math.max(...values);
  const exps = values.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Model outputs may be logits or probabilities; normalise to probabilities before ranking. */
export function toProbabilities(scores: number[]): number[] {
  if (!scores.length) return [];
  const sum = scores.reduce((a, b) => a + b, 0);
  const isDistribution = scores.every((s) => s >= 0 && s <= 1) && Math.abs(sum - 1) < 0.02;
  return isDistribution ? scores : softmax(scores);
}

export function topPredictions(scores: number[], labels: string[], k = 3): OnDevicePrediction[] {
  return toProbabilities(scores)
    .map((confidence, i) => ({ confidence, label: labels[i] ?? `class ${i}` }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, k)
    .map(({ label, confidence }) => ({ label, confidence, ...formatLabel(label) }));
}
