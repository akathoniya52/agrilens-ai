import { describe, expect, it } from "vitest";
import { classifyOutboxStatus } from "@/lib/outbox";

describe("classifyOutboxStatus", () => {
  it("treats success and 409 (already received) as delivered", () => {
    expect(classifyOutboxStatus(200)).toBe("delivered");
    expect(classifyOutboxStatus(201)).toBe("delivered");
    expect(classifyOutboxStatus(409)).toBe("delivered");
  });

  it("delivers resent questions that are saved but unanswered, and retries while the chat is busy", () => {
    expect(classifyOutboxStatus(409, "unanswered")).toBe("delivered");
    expect(classifyOutboxStatus(409, null)).toBe("delivered");
    expect(classifyOutboxStatus(409, "busy")).toBe("retry");
    expect(classifyOutboxStatus(200, "busy")).toBe("delivered");
  });

  it("drops only permanently invalid items", () => {
    expect(classifyOutboxStatus(400)).toBe("drop");
    expect(classifyOutboxStatus(404)).toBe("drop");
  });

  it("keeps items for retry on auth, credits, rate limits, timeouts and server errors", () => {
    for (const status of [401, 402, 403, 408, 429, 500, 502, 503]) {
      expect(classifyOutboxStatus(status)).toBe("retry");
    }
  });
});
