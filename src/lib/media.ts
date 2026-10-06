import type { Part } from "@google/genai";
import type { Attachment } from "@/types/chat";

/** Upload/voice limits stay below Vercel's 4.5 MB request body limit (multipart overhead included). */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
/** Total decoded size of inline (data URL) attachments in one message; keeps it far below MongoDB's 16 MB. */
export const MAX_INLINE_ATTACHMENT_BYTES = 2 * MAX_IMAGE_BYTES;
export const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";
const DATA_URL_PATTERN = /^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/=]+)$/;

export function isAllowedImageType(type: string): boolean {
  return ALLOWED_IMAGE_TYPES.some((allowed) => allowed === baseMimeType(type));
}

export function baseMimeType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

export function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const match = DATA_URL_PATTERN.exec(url);
  return match ? { mimeType: match[1], data: match[2] } : null;
}

/** BLOB_STORE_HOST, else the store host encoded in BLOB_READ_WRITE_TOKEN (`vercel_blob_rw_<storeId>_<secret>`). */
export function configuredBlobHost(): string | undefined {
  const explicit = process.env.BLOB_STORE_HOST?.trim();
  if (explicit) return explicit;
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.split("_")[3];
  return storeId ? `${storeId.toLowerCase()}${BLOB_HOST_SUFFIX}` : undefined;
}

/** Decoded size of a base64 payload without allocating it. */
export function base64ByteLength(data: string): number {
  const padding = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.floor((data.length * 3) / 4) - padding;
}

export function toDataUrl(bytes: Uint8Array, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")}`;
}

/**
 * Only the user's own uploads in our Blob store are fetched server-side (prevents SSRF and reading
 * other users' blobs). The hostname must match our store exactly (see configuredBlobHost); only outside
 * production, with no store configured, is any Vercel Blob host accepted. Either way the path must be
 * `/uploads/<userId>/` (see /api/upload). Inline data URLs (dev uploads without Blob) are rejected in
 * production, where they would bypass the upload size and rate limits, and capped at MAX_IMAGE_BYTES.
 */
export function isTrustedImageUrl(
  url: string,
  userId: string,
  blobHost = configuredBlobHost(),
  production = process.env.NODE_ENV === "production"
): boolean {
  if (url.startsWith("data:")) return !production && isValidInlineImage(url);
  try {
    const parsed = new URL(url);
    const host = blobHost?.trim().toLowerCase();
    const hostOk = host ? parsed.hostname === host : !production && parsed.hostname.endsWith(BLOB_HOST_SUFFIX);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      hostOk &&
      Boolean(userId) &&
      parsed.pathname.startsWith(`/uploads/${userId}/`)
    );
  } catch {
    return false;
  }
}

function isValidInlineImage(url: string): boolean {
  const inline = parseDataUrl(url);
  return inline !== null && base64ByteLength(inline.data) <= MAX_IMAGE_BYTES;
}

/** Decoded bytes of all inline data URL attachments (0 for Blob URLs). */
export function inlineAttachmentBytes(attachments: Pick<Attachment, "url">[]): number {
  return attachments.reduce((total, { url }) => {
    const inline = url.startsWith("data:") ? parseDataUrl(url) : null;
    return total + (inline ? base64ByteLength(inline.data) : 0);
  }, 0);
}

async function attachmentToPart(attachment: Attachment): Promise<Part> {
  const inline = parseDataUrl(attachment.url);
  if (inline) {
    if (!isAllowedImageType(inline.mimeType)) throw new Error("Unsupported image type");
    if (base64ByteLength(inline.data) > MAX_IMAGE_BYTES) throw new Error("Image too large");
    return { inlineData: { mimeType: baseMimeType(inline.mimeType), data: inline.data } };
  }

  const res = await fetch(attachment.url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error("Image too large");
  const bytes = await readCapped(res, MAX_IMAGE_BYTES);
  const mimeType = sniffImageType(bytes);
  if (!mimeType) throw new Error("Unsupported image type");

  return { inlineData: { mimeType, data: Buffer.from(bytes).toString("base64") } };
}

/** Reads a response body, aborting once it exceeds `maxBytes` (Content-Length can be absent or wrong). */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("Response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** True when the bytes start with a container signature MediaRecorder/phones produce (WebM, Ogg, MP4, WAV, MP3, AAC, FLAC). */
export function looksLikeAudio(bytes: Uint8Array): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  return (
    (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) ||
    ascii(0, 4) === "OggS" ||
    ascii(4, 8) === "ftyp" ||
    (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") ||
    ascii(0, 3) === "ID3" ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) ||
    ascii(0, 4) === "fLaC"
  );
}

/** Detects the image type from its magic bytes; the client-declared MIME type is never trusted. */
export function sniffImageType(bytes: Uint8Array): (typeof ALLOWED_IMAGE_TYPES)[number] | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG" && bytes[4] === 0x0d && bytes[5] === 0x0a) return "image/png";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (ascii(4, 8) === "ftyp") {
    const brand = ascii(8, 12);
    if (["heic", "heix", "heim", "heis", "hevc", "hevx"].includes(brand)) return "image/heic";
    if (["mif1", "msf1", "heif"].includes(brand)) return "image/heif";
  }
  return null;
}

/**
 * Stored attachments the server may load: the user's own Blob uploads, or inline images already saved
 * on the message (WhatsApp photos, dev uploads). Client requests are still checked with isTrustedImageUrl.
 */
export function imageAttachments(attachments: Attachment[] | undefined, userId: string): Attachment[] {
  return (attachments ?? []).filter(
    (a) => isAllowedImageType(a.type) && (isValidInlineImage(a.url) || isTrustedImageUrl(a.url, userId))
  );
}

export interface LoadedImages {
  parts: Part[];
  /** Attachments that were skipped or could not be loaded. */
  failed: number;
}

/** Loads every image it can; one bad attachment no longer drops the others. */
export async function loadImageParts(attachments: Attachment[] | undefined, userId: string): Promise<LoadedImages> {
  const all = attachments ?? [];
  const results = await Promise.allSettled(imageAttachments(all, userId).map(attachmentToPart));
  const parts: Part[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") parts.push(result.value);
    else console.error("AgriLens image loading failed:", result.reason);
  }
  return { parts, failed: all.length - parts.length };
}
