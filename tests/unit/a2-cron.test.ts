import { describe, expect, it, vi } from "vitest";
import {
  REMINDER_CLAIM_LEASE_MS,
  REMINDER_MAX_ATTEMPTS,
  claimableReminderFilter,
  reminderOutcome,
  withTimeout,
} from "@/lib/push";
import { roundedLocation } from "@/lib/weather";

describe("reminder claims (#5)", () => {
  it("only selects unsent reminders with attempts left and no live lease", () => {
    const now = new Date("2026-10-06T02:00:00Z");
    expect(claimableReminderFilter(now)).toEqual({
      done: false,
      notifiedAt: null,
      attempts: { $not: { $gte: REMINDER_MAX_ATTEMPTS } },
      $or: [{ claimedAt: null }, { claimedAt: { $lte: new Date(now.getTime() - REMINDER_CLAIM_LEASE_MS) } }],
    });
  });

  it("marks sent on any delivery or when there is nothing to send to", () => {
    expect(reminderOutcome({ delivered: 1, failed: 1 }, 1)).toBe("sent");
    expect(reminderOutcome({ delivered: 0, failed: 0 }, 1)).toBe("sent");
  });

  it("retries failures until the attempts run out", () => {
    expect(reminderOutcome({ delivered: 0, failed: 1 }, 1)).toBe("retry");
    expect(reminderOutcome({ delivered: 0, failed: 2 }, REMINDER_MAX_ATTEMPTS - 1)).toBe("retry");
    expect(reminderOutcome({ delivered: 0, failed: 1 }, REMINDER_MAX_ATTEMPTS)).toBe("failed");
  });
});

describe("withTimeout", () => {
  it("rejects a hung promise and clears its timer when settled", async () => {
    vi.useFakeTimers();
    try {
      const hung = withTimeout(new Promise<never>(() => {}), 8000);
      const assertion = expect(hung).rejects.toThrow("Timed out after 8000 ms");
      await vi.advanceTimersByTimeAsync(8000);
      await assertion;

      await expect(withTimeout(Promise.resolve(42), 8000)).resolves.toBe(42);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("roundedLocation (#6)", () => {
  it("shares one cache key between neighbouring farms", () => {
    const a = roundedLocation(23.022, 72.571);
    const b = roundedLocation(23.04, 72.559);
    expect(a.key).toBe(b.key);
    expect(a).toMatchObject({ lat: 23, lon: 72.6 });
    expect(roundedLocation(23.06, 72.571).key).not.toBe(a.key);
  });
});
