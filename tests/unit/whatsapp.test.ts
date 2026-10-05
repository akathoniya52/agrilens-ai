import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizePhone, parseInboundMessages, splitMessage, toWhatsAppText, verifyWebhookSignature } from "@/lib/whatsapp";

const SECRET = "app-secret";
const sign = (body: string, secret = SECRET) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("accepts a valid signature", () => {
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects tampered bodies, wrong secrets and malformed headers", () => {
    expect(verifyWebhookSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha1=abc", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz", SECRET)).toBe(false);
  });
});

describe("parseInboundMessages", () => {
  it("extracts text and image messages and ignores statuses", () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [{ id: "s1" }],
                messages: [
                  { id: "m1", from: "919876543210", type: "text", text: { body: " Hi " } },
                  { id: "m2", from: "919876543210", type: "image", image: { id: "media-1", caption: "leaf" } },
                  { id: "m3", from: "919876543210", type: "audio", audio: { id: "a" } },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseInboundMessages(payload)).toEqual([
      { id: "m1", from: "919876543210", type: "text", text: "Hi", imageId: null },
      { id: "m2", from: "919876543210", type: "image", text: "leaf", imageId: "media-1" },
    ]);
    expect(parseInboundMessages({ object: "page" })).toEqual([]);
  });
});

describe("text helpers", () => {
  it("normalises phone numbers", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("919876543210");
    expect(normalizePhone("0044 7700 900123")).toBe("447700900123");
  });

  it("converts markdown to WhatsApp formatting", () => {
    expect(toWhatsAppText("## Title\n**bold** [site](https://x.org)")).toBe("*Title*\n*bold* site (https://x.org)");
  });

  it("splits long messages under the limit", () => {
    const parts = splitMessage("word ".repeat(100).trim(), 50);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 50)).toBe(true);
    expect(parts.join(" ")).toBe("word ".repeat(100).trim());
  });
});
