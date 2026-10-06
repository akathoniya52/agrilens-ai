import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { agentToolDeclarations, asksForReminder, resolveReminderDueAt } from "@/lib/agent-tools";
import { parseJsonBody } from "@/lib/http";
import { imageDimensions } from "@/lib/image-dimensions";
import { imageAttachments, inlineAttachmentBytes, isTrustedImageUrl } from "@/lib/media";
import { currentTimeInstruction } from "@/lib/prompts";
import { z } from "zod";

const USER = "64b7f0c2a1b2c3d4e5f60718";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("inline images (#10)", () => {
  it("rejects data URLs from clients in production only", () => {
    expect(isTrustedImageUrl(PNG, USER, undefined, true)).toBe(false);
    expect(isTrustedImageUrl(PNG, USER, undefined, false)).toBe(true);
  });

  it("still loads inline images already stored on a message (WhatsApp photos)", () => {
    expect(imageAttachments([{ url: PNG, type: "image/png" }], USER)).toHaveLength(1);
    expect(imageAttachments([{ url: "https://evil.com/x.png", type: "image/png" }], USER)).toHaveLength(0);
  });

  it("sums decoded inline bytes and ignores Blob URLs", () => {
    const blob = `https://abc.public.blob.vercel-storage.com/uploads/${USER}/a.png`;
    expect(inlineAttachmentBytes([{ url: PNG }, { url: PNG }, { url: blob }])).toBe(16);
  });
});

describe("parseJsonBody size cap (#10)", () => {
  const schema = z.object({ content: z.string() });
  const request = (body: string) => new Request("http://x/api", { method: "POST", body });

  it("returns 413 once the body exceeds the cap, even without Content-Length", async () => {
    const result = await parseJsonBody(request(JSON.stringify({ content: "x".repeat(200) })), schema, 100);
    expect("error" in result && result.error.status).toBe(413);
  });

  it("parses bodies within the cap", async () => {
    const result = await parseJsonBody(request(JSON.stringify({ content: "hi" })), schema, 100);
    expect(result).toEqual({ data: { content: "hi" } });
  });
});

describe("reminder dates (#8)", () => {
  const now = new Date("2026-10-06T10:00:00Z");

  it("reads a bare local time in the user's zone and keeps explicit offsets", () => {
    expect(resolveReminderDueAt("2026-10-07T07:00", "Asia/Kolkata", now)).toEqual(new Date("2026-10-07T01:30:00Z"));
    expect(resolveReminderDueAt("2026-10-07T07:00:00+05:30", "UTC", now)).toEqual(new Date("2026-10-07T01:30:00Z"));
  });

  it("returns recoverable errors for bad, past and far-future dates", () => {
    expect(resolveReminderDueAt("tomorrow", "Asia/Kolkata", now)).toHaveProperty("error");
    expect(resolveReminderDueAt("2026-10-06T09:00:00Z", "UTC", now)).toHaveProperty("error");
    expect(resolveReminderDueAt("2026-10-06T09:58:00Z", "UTC", now)).toEqual(new Date("2026-10-06T09:58:00Z"));
    expect(resolveReminderDueAt("2027-12-01T00:00:00Z", "UTC", now)).toHaveProperty("error");
  });

  it("puts the user's local date, weekday and offset in the prompt", () => {
    const text = currentTimeInstruction(now, "Asia/Kolkata");
    expect(text).toContain("Tuesday 2026-10-06 15:30");
    expect(text).toContain("Asia/Kolkata, UTC+05:30");
    expect(currentTimeInstruction(now, "not/a zone")).toContain("Asia/Kolkata");
  });
});

describe("reminder intent (#40)", () => {
  it("detects reminder requests across supported languages", () => {
    for (const text of [
      "Remind me to spray tomorrow at 7am",
      "कल सुबह छिड़काव की याद दिलाना",
      "Recuérdame regar el lunes",
      "Me lembre de irrigar amanhã",
      "Nikumbushe kesho",
      "నాకు రేపు గుర్తు చేయండి",
    ]) {
      expect(asksForReminder(text)).toBe(true);
    }
    expect(asksForReminder("Why are my tomato leaves yellow?")).toBe(false);
  });

  it("hides createReminder unless the message asks for one", () => {
    const names = (allowReminder: boolean) => agentToolDeclarations({ allowReminder }).map((d) => d.name);
    expect(names(false)).not.toContain("createReminder");
    expect(names(true)).toContain("createReminder");
  });
});

describe("imageDimensions", () => {
  it("reads width and height, and returns null for non-images", async () => {
    const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: "#0f0" } }).png().toBuffer();
    expect(await imageDimensions(png)).toEqual({ width: 3, height: 2 });
    expect(await imageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
