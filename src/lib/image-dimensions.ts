import sharp from "sharp";

export interface ImageDimensions {
  width: number;
  height: number;
}

/** Displayed pixel size of an encoded image (EXIF orientation applied), or null when it can't be read. Never throws. */
export async function imageDimensions(bytes: Uint8Array): Promise<ImageDimensions | null> {
  try {
    const { autoOrient } = await sharp(bytes).metadata();
    const { width, height } = autoOrient;
    return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 ? { width, height } : null;
  } catch (error) {
    console.warn("AgriLens image dimensions unavailable:", error instanceof Error ? error.message : error);
    return null;
  }
}
