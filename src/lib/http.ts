import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import type { z } from "zod";

export function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

/** Constant-time string comparison; hashing first equalises lengths so the secret's length isn't leaked. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/** Rejects requests whose declared Content-Length exceeds `maxBytes` before the body is buffered. */
export function exceedsContentLength(req: Request, maxBytes: number): boolean {
  const declared = Number(req.headers.get("content-length"));
  return Number.isFinite(declared) && declared > maxBytes;
}

/** Logs the details server-side; the client only ever sees a generic message. */
export function serverError(context: string, error: unknown) {
  console.error(`Error in ${context}:`, error);
  return jsonError("Internal server error", 500);
}

/** MongoDB E11000 (unique index violation). */
export function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export function isObjectId(id: string): boolean {
  return isValidObjectId(id);
}

export async function parseJsonBody<T extends z.ZodType>(
  req: Request,
  schema: T
): Promise<{ data: z.infer<T> } | { error: NextResponse }> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { error: jsonError("Invalid JSON body", 400) };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.join(".");
    return { error: jsonError(path ? `${path}: ${issue.message}` : issue?.message ?? "Invalid body", 400) };
  }
  return { data: result.data };
}
