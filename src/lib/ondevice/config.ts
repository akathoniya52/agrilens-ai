export type ModelFormat = "graph" | "layers";
export type Normalization = "0,1" | "-1,1" | "none";

export interface OnDeviceConfig {
  modelUrl: string;
  labelsUrl: string;
  format: ModelFormat | "auto";
  inputSize: number;
  normalization: Normalization;
}

// NEXT_PUBLIC_* must be referenced literally so Next can inline them into the client bundle.
export function onDeviceConfig(): OnDeviceConfig | null {
  const modelUrl = process.env.NEXT_PUBLIC_TFJS_MODEL_URL;
  if (!modelUrl) return null;
  const format = process.env.NEXT_PUBLIC_TFJS_MODEL_FORMAT;
  const normalization = process.env.NEXT_PUBLIC_TFJS_NORMALIZE;
  const size = Number(process.env.NEXT_PUBLIC_TFJS_INPUT_SIZE);
  return {
    modelUrl,
    labelsUrl: process.env.NEXT_PUBLIC_TFJS_LABELS_URL || new URL("labels.json", new URL(modelUrl, "http://local/")).href.replace(/^http:\/\/local/, ""),
    format: format === "graph" || format === "layers" ? format : "auto",
    inputSize: Number.isInteger(size) && size >= 32 && size <= 1024 ? size : 224,
    normalization: normalization === "-1,1" || normalization === "none" ? normalization : "0,1",
  };
}

export const onDeviceEnabled = () => onDeviceConfig() !== null;
