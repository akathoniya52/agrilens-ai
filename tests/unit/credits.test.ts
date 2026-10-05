import { describe, expect, it } from "vitest";
import { AI_CREDIT_COST, canAfford, creditGuardFilter } from "@/lib/credits";

describe("credits guard", () => {
  it("costs 1 credit per AI answer", () => {
    expect(AI_CREDIT_COST).toBe(1);
  });

  it("allows only balances covering the cost", () => {
    expect(canAfford(1)).toBe(true);
    expect(canAfford(100)).toBe(true);
    expect(canAfford(0)).toBe(false);
    expect(canAfford(-3)).toBe(false);
    expect(canAfford(null)).toBe(false);
    expect(canAfford(undefined)).toBe(false);
    expect(canAfford(2, 3)).toBe(false);
  });

  it("builds an atomic filter that requires enough credits", () => {
    expect(creditGuardFilter("abc")).toEqual({ _id: "abc", credits: { $gte: 1 } });
    expect(creditGuardFilter("abc", 5)).toEqual({ _id: "abc", credits: { $gte: 5 } });
  });
});
