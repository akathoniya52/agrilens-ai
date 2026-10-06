// Client-only: uses canvas / createImageBitmap. Do not import from server code.

export const MAX_IMAGE_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.82;

export interface CompressedImage {
  blob: Blob;
  width: number;
  height: number;
  type: string;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
}

/** Conversion failure with a message that's safe to show to the user. */
export class ImageConversionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ImageConversionError";
  }
}

/** By extension too: Chrome and Firefox often leave `type` empty for HEIC files. */
export function isHeic(file: Blob): boolean {
  return /^image\/hei[cf](-sequence)?$/i.test(file.type) || (file instanceof File && /\.(heic|heif)$/i.test(file.name));
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith("image/") || isHeic(file);
}

async function heicToJpeg(file: Blob): Promise<Blob> {
  // `typeof window` is a compile-time constant, so server bundles drop this branch and heic2any (~1.3 MB) with it.
  if (typeof window !== "undefined") {
    try {
      const { default: heic2any } = await import("heic2any");
      const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
      const jpeg = Array.isArray(converted) ? converted[0] : converted;
      if (!jpeg) throw new Error("heic2any returned no image");
      return jpeg;
    } catch (error) {
      throw new ImageConversionError("This HEIC photo couldn't be converted. Try sending it as a JPEG.", { cause: error });
    }
  }
  throw new ImageConversionError("HEIC photos can only be converted in the browser.");
}

async function decodeWithBitmap(file: Blob): Promise<DecodedImage | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
  } catch {
    return null;
  }
}

async function decodeWithElement(file: Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Downscales an image so its longest side is at most `maxDimension` and re-encodes it as WebP
 * (JPEG where the browser can't encode WebP, e.g. older Safari). EXIF orientation is applied.
 * HEIC/HEIF the browser can't decode (anything but Safari) is converted to JPEG first; if that fails
 * it throws an `ImageConversionError`. Throws when the browser can't decode the file.
 */
export async function compressImage(
  file: Blob,
  { maxDimension = MAX_IMAGE_DIMENSION, quality = DEFAULT_QUALITY } = {}
): Promise<CompressedImage> {
  const image = (await decodeWithBitmap(file)) ?? (await decodeWithElement(isHeic(file) ? await heicToJpeg(file) : file));
  try {
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");

    // Flatten transparency so the JPEG fallback doesn't turn it black.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image.source, 0, 0, width, height);

    const webp = await canvasToBlob(canvas, "image/webp", quality);
    const blob = webp?.type === "image/webp" ? webp : await canvasToBlob(canvas, "image/jpeg", quality);
    if (!blob) throw new Error("Image encoding failed");

    return { blob, width, height, type: blob.type };
  } finally {
    image.release();
  }
}
