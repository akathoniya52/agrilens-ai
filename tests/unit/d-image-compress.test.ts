import { describe, expect, it } from "vitest";
import { compressImage, ImageConversionError, isHeic, isImageFile } from "@/lib/image-compress";

const file = (name: string, type: string) => new File([new Uint8Array([0, 0, 0, 24])], name, { type });

describe("HEIC detection", () => {
  it("recognises HEIC/HEIF by MIME type or, when the type is empty, by extension", () => {
    expect(isHeic(file("IMG_0001.HEIC", ""))).toBe(true);
    expect(isHeic(file("photo", "image/heif"))).toBe(true);
    expect(isHeic(file("burst", "image/heic-sequence"))).toBe(true);
    expect(isHeic(new Blob([], { type: "image/heic" }))).toBe(true);
    expect(isHeic(file("leaf.jpg", "image/jpeg"))).toBe(false);
  });

  it("lets HEIC through as an image even without a MIME type", () => {
    expect(isImageFile(file("IMG_0001.heic", ""))).toBe(true);
    expect(isImageFile(file("notes.txt", "text/plain"))).toBe(false);
  });
});

describe("compressImage", () => {
  it("throws an ImageConversionError when a HEIC photo can't be converted", async () => {
    await expect(compressImage(file("IMG_0001.heic", "image/heic"))).rejects.toBeInstanceOf(ImageConversionError);
  });
});
