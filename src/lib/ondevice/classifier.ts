import type { GraphModel, LayersModel, NamedTensorMap, Tensor } from "@tensorflow/tfjs";
import { onDeviceConfig, type OnDeviceConfig } from "./config";
import { parseLabels, topPredictions, type OnDevicePrediction } from "./labels";

type Tf = typeof import("@tensorflow/tfjs");
export type PixelSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap;

export interface OnDeviceClassifier {
  classify: (source: PixelSource, k?: number) => Promise<OnDevicePrediction[]>;
}

let pending: Promise<OnDeviceClassifier | null> | null = null;

async function loadModel(tf: Tf, config: OnDeviceConfig): Promise<GraphModel | LayersModel> {
  if (config.format === "graph") return tf.loadGraphModel(config.modelUrl);
  if (config.format === "layers") return tf.loadLayersModel(config.modelUrl);
  try {
    return await tf.loadLayersModel(config.modelUrl);
  } catch {
    return tf.loadGraphModel(config.modelUrl);
  }
}

function firstTensor(out: Tensor | Tensor[] | NamedTensorMap): Tensor {
  if (Array.isArray(out)) return out[0];
  if ("dataSync" in out && typeof out.dataSync === "function") return out as Tensor;
  return Object.values(out as NamedTensorMap)[0];
}

async function create(config: OnDeviceConfig): Promise<OnDeviceClassifier> {
  const tf: Tf = await import("@tensorflow/tfjs");
  await tf.ready();
  const [model, labels] = await Promise.all([
    loadModel(tf, config),
    fetch(config.labelsUrl).then(async (res) => (res.ok ? parseLabels(await res.json()) : [])),
  ]);
  const size = config.inputSize;

  return {
    async classify(source, k = 3) {
      const scores = tf.tidy(() => {
        const pixels = tf.image.resizeBilinear(tf.browser.fromPixels(source).toFloat(), [size, size]);
        const input =
          config.normalization === "0,1" ? pixels.div(255) : config.normalization === "-1,1" ? pixels.div(127.5).sub(1) : pixels;
        return firstTensor(model.predict(input.expandDims(0)) as Tensor | Tensor[] | NamedTensorMap).squeeze();
      });
      const values = Array.from(await scores.data());
      scores.dispose();
      return topPredictions(values, labels, k);
    },
  };
}

/** Lazily loads TF.js + the model once. Resolves null when not configured or loading fails. */
export function loadOnDeviceClassifier(): Promise<OnDeviceClassifier | null> {
  const config = onDeviceConfig();
  if (!config || typeof window === "undefined") return Promise.resolve(null);
  pending ??= create(config).catch((error: unknown) => {
    console.warn("AgriLens on-device model unavailable:", error);
    pending = null;
    return null;
  });
  return pending;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = src;
  });
}
