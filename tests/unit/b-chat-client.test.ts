import { describe, expect, it } from "vitest";
import { mergeDraftText, pickRestorable } from "@/components/chat/draft";
import { mergeLocalChats } from "@/components/chat/group-chats";
import { isOwnStorageImageUrl, safeLinkHref } from "@/components/chat/trusted-image";
import type { ChatSummary } from "@/types/chat";

describe("isOwnStorageImageUrl", () => {
  it("accepts https images from Vercel Blob storage", () => {
    expect(isOwnStorageImageUrl("https://abc123.public.blob.vercel-storage.com/uploads/u1/leaf.webp")).toBe(true);
  });

  it.each([
    "http://abc123.public.blob.vercel-storage.com/x.png",
    "https://public.blob.vercel-storage.com/x.png",
    "https://.public.blob.vercel-storage.com/x.png",
    "https://evil.com/x.png?h=abc.public.blob.vercel-storage.com",
    "https://abc.public.blob.vercel-storage.com.evil.com/x.png",
    "https://user:pw@abc.public.blob.vercel-storage.com/x.png",
    "https://abc.public.blob.vercel-storage.com:8443/x.png",
    "data:image/png;base64,AAAA",
    "javascript:alert(1)",
    "/uploads/x.png",
    "https://abc.public.blob.vercel-storage.com/other/x.png",
    "https://abc.public.blob.vercel-storage.com/uploads/x.png?d=secret",
    "",
    undefined,
  ])("rejects %s", (url) => {
    expect(isOwnStorageImageUrl(url)).toBe(false);
  });

  it("only accepts the pinned store when one is configured", () => {
    const store = "abc123.public.blob.vercel-storage.com";
    expect(isOwnStorageImageUrl(`https://${store}/uploads/u1/leaf.webp`, store)).toBe(true);
    expect(isOwnStorageImageUrl("https://attacker.public.blob.vercel-storage.com/uploads/p.png", store)).toBe(false);
  });
});

describe("safeLinkHref", () => {
  it("keeps http(s) and mailto links", () => {
    expect(safeLinkHref("https://icar.org.in")).toBe("https://icar.org.in");
    expect(safeLinkHref("mailto:help@example.com")).toBe("mailto:help@example.com");
  });

  it.each(["javascript:alert(1)", "data:text/html,<b>x</b>", "vbscript:x", "/relative", "", undefined])("drops %s", (href) => {
    expect(safeLinkHref(href)).toBeUndefined();
  });
});

describe("mergeDraftText", () => {
  it("restores into an empty composer", () => {
    expect(mergeDraftText("old question", "  ")).toBe("old question");
  });

  it("keeps newer input and puts the restored draft first", () => {
    expect(mergeDraftText("old question", "new note")).toBe("old question\nnew note");
  });

  it("does not duplicate a draft that is already there", () => {
    expect(mergeDraftText("old", "old and more")).toBe("old and more");
    expect(mergeDraftText("", "typed")).toBe("typed");
  });
});

describe("pickRestorable", () => {
  const a = (url: string) => ({ url, type: "image/webp" });

  it("skips images already in the tray and respects the free slots", () => {
    expect(pickRestorable(["u1"], [a("u1"), a("u2"), a("u3"), a("u2")], 1)).toEqual([a("u2")]);
    expect(pickRestorable([], [a("u1"), a("u1")], 4)).toEqual([a("u1")]);
    expect(pickRestorable([], [a("u1")], 0)).toEqual([]);
  });
});

describe("mergeLocalChats", () => {
  const chat = (id: string, at: string): ChatSummary => ({ _id: id, title: id, lastMessageAt: at, createdAt: at });

  it("keeps a chat created in this tab that the server list doesn't have yet", () => {
    const server = [chat("a", "2026-10-05T10:00:00Z")];
    const local = [chat("new", "2026-10-06T10:00:00Z")];
    expect(mergeLocalChats(server, local).map((c) => c._id)).toEqual(["new", "a"]);
  });

  it("prefers the server copy once it is there", () => {
    const server = [chat("new", "2026-10-06T11:00:00Z")];
    const result = mergeLocalChats(server, [chat("new", "2026-10-06T10:00:00Z")]);
    expect(result).toBe(server);
  });
});
