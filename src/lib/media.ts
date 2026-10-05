import type { Part } from "@google/genai";
import type { Attachment } from "@/types/chat";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
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

export function toDataUrl(buffer: ArrayBuffer, mimeType: string): string {
  return `data:${mimeType};base64,${Buffer.from(buffer).toString("base64")}`;
}

/**
 * Only the user's own uploads in our Blob store are fetched server-side (prevents SSRF and reading
 * other users' blobs). With BLOB_STORE_HOST set the hostname must match exactly; otherwise any
 * Vercel Blob host is accepted. Either way the path must be `/uploads/<userId>/` (see /api/upload).
 */
export function isTrustedImageUrl(url: string, userId: string, blobHost = process.env.BLOB_STORE_HOST): boolean {
  if (url.startsWith("data:")) return parseDataUrl(url) !== null;
  try {
    const parsed = new URL(url);
    const host = blobHost?.trim().toLowerCase();
    const hostOk = host ? parsed.hostname === host : parsed.hostname.endsWith(BLOB_HOST_SUFFIX);
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

async function attachmentToPart(attachment: Attachment): Promise<Part> {
  const inline = parseDataUrl(attachment.url);
  if (inline) {
    if (!isAllowedImageType(inline.mimeType)) throw new Error("Unsupported image type");
    return { inlineData: { mimeType: baseMimeType(inline.mimeType), data: inline.data } };
  }

  const res = await fetch(attachment.url, { redirect: "error", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Failed to fetch image (${res.status})`);
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) throw new Error("Image too large");
  const mimeType = baseMimeType(res.headers.get("content-type") ?? attachment.type);
  if (!isAllowedImageType(mimeType)) throw new Error("Unsupported image type");
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength > MAX_IMAGE_BYTES) throw new Error("Image too large");

  return { inlineData: { mimeType, data: Buffer.from(buffer).toString("base64") } };
}

export function imageAttachments(attachments: Attachment[] | undefined, userId: string): Attachment[] {
  return (attachments ?? []).filter((a) => isAllowedImageType(a.type) && isTrustedImageUrl(a.url, userId));
}

export async function loadImageParts(attachments: Attachment[], userId: string): Promise<Part[]> {
  return Promise.all(imageAttachments(attachments, userId).map(attachmentToPart));
}
