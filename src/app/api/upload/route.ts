import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireUser } from "@/lib/auth";
import { exceedsContentLength, jsonError, serverError } from "@/lib/http";
import { MAX_IMAGE_BYTES, baseMimeType, isAllowedImageType, sniffImageType, toDataUrl } from "@/lib/media";
import { imageDimensions } from "@/lib/image-dimensions";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import type { Attachment } from "@/types/chat";

export const runtime = "nodejs";

const MULTIPART_OVERHEAD_BYTES = 64 * 1024;
const TOO_LARGE = "Image must be 4MB or smaller";

function safeFileName(name: string, mimeType: string): string {
  const base = name.replace(/[^\w.-]+/g, "_").replace(/^[._]+/, "").slice(0, 80);
  return base || `image.${mimeType.split("/")[1] ?? "jpg"}`;
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    if (exceedsContentLength(req, MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES)) {
      return jsonError(TOO_LARGE, 413);
    }
    const limited = await rateLimit("upload", auth.user._id.toString(), RATE_LIMITS.upload);
    if (limited) return limited;

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return jsonError("Invalid form data", 400);
    }
    const file = form.get("file");
    if (!(file instanceof File)) return jsonError("Missing file", 400);

    if (!isAllowedImageType(baseMimeType(file.type))) {
      return jsonError("Only JPEG, PNG, WebP or HEIC images are allowed", 415);
    }
    if (file.size > MAX_IMAGE_BYTES) return jsonError(TOO_LARGE, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const mimeType = sniffImageType(bytes);
    if (!mimeType) return jsonError("Only JPEG, PNG, WebP or HEIC images are allowed", 415);
    const dimensions = (await imageDimensions(bytes)) ?? {};

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      const attachment: Attachment = { url: toDataUrl(bytes, mimeType), type: mimeType, ...dimensions };
      return NextResponse.json(attachment, { status: 201 });
    }

    const blob = await put(
      `uploads/${auth.user._id.toString()}/${safeFileName(file.name, mimeType)}`,
      Buffer.from(bytes),
      { access: "public", addRandomSuffix: true, contentType: mimeType }
    );
    const attachment: Attachment = { url: blob.url, type: mimeType, ...dimensions };
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    return serverError("POST /api/upload", error);
  }
}
