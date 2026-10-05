import { describe, expect, it } from "vitest";
import { isTrustedImageUrl } from "@/lib/media";

const USER = "64b7f0c2a1b2c3d4e5f60718";
const STORE = "abc123.public.blob.vercel-storage.com";

describe("isTrustedImageUrl", () => {
  it("accepts well-formed data URLs only", () => {
    expect(isTrustedImageUrl("data:image/png;base64,iVBORw0KGgo=", USER)).toBe(true);
    expect(isTrustedImageUrl("data:image/png;base64,<script>", USER)).toBe(false);
  });

  it("pins the exact host when BLOB_STORE_HOST is set", () => {
    expect(isTrustedImageUrl(`https://${STORE}/uploads/${USER}/leaf.jpg`, USER, STORE)).toBe(true);
    expect(isTrustedImageUrl(`https://other.public.blob.vercel-storage.com/uploads/${USER}/leaf.jpg`, USER, STORE)).toBe(false);
  });

  it("falls back to the Vercel Blob suffix when unset", () => {
    expect(isTrustedImageUrl(`https://other.public.blob.vercel-storage.com/uploads/${USER}/leaf.jpg`, USER, undefined)).toBe(true);
    expect(isTrustedImageUrl(`https://evil.com/uploads/${USER}/leaf.jpg`, USER, undefined)).toBe(false);
    expect(isTrustedImageUrl(`https://public.blob.vercel-storage.com.evil.com/uploads/${USER}/x.jpg`, USER, undefined)).toBe(false);
  });

  it("requires the caller's own upload path, https and no credentials/port", () => {
    expect(isTrustedImageUrl(`https://${STORE}/uploads/someoneelse/leaf.jpg`, USER, STORE)).toBe(false);
    expect(isTrustedImageUrl(`https://${STORE}/leaf.jpg`, USER, STORE)).toBe(false);
    expect(isTrustedImageUrl(`http://${STORE}/uploads/${USER}/leaf.jpg`, USER, STORE)).toBe(false);
    expect(isTrustedImageUrl(`https://u:p@${STORE}/uploads/${USER}/leaf.jpg`, USER, STORE)).toBe(false);
    expect(isTrustedImageUrl(`https://${STORE}:8443/uploads/${USER}/leaf.jpg`, USER, STORE)).toBe(false);
    expect(isTrustedImageUrl("not a url", USER, STORE)).toBe(false);
  });
});
