import { describe, expect, it } from "vitest";
import { expertEmails, isExpert } from "@/lib/cases";
import { generateDeviceToken, hashDeviceToken, readingTime, ReadingsBodySchema, verifyDeviceToken } from "@/lib/iot";
import { formatLabel, parseLabels, topPredictions } from "@/lib/ondevice/labels";
import { estimateYield } from "@/lib/yield";

describe("IoT device tokens", () => {
  it("verifies only the matching token", () => {
    const token = generateDeviceToken();
    const hash = hashDeviceToken(token);
    expect(verifyDeviceToken(token, hash)).toBe(true);
    expect(verifyDeviceToken(generateDeviceToken(), hash)).toBe(false);
    expect(verifyDeviceToken(token, null)).toBe(false);
    expect(verifyDeviceToken("nope", hash)).toBe(false);
  });

  it("validates readings and timestamps", () => {
    expect(ReadingsBodySchema.safeParse({ soilMoisture: 30 }).success).toBe(true);
    expect(ReadingsBodySchema.safeParse({ battery: 80 }).success).toBe(false);
    expect(ReadingsBodySchema.safeParse({ humidity: 140 }).success).toBe(false);
    const now = Date.parse("2026-09-01T12:00:00Z");
    expect(readingTime(undefined, now)?.getTime()).toBe(now);
    expect(readingTime(now / 1000 - 60, now)?.getTime()).toBe(now - 60_000);
    expect(readingTime(now + 3_600_000, now)).toBeNull();
  });
});

describe("expert emails", () => {
  it("parses a comma/space separated list case-insensitively", () => {
    expect([...expertEmails("A@x.org, b@y.org ;c@z.org")]).toEqual(["a@x.org", "b@y.org", "c@z.org"]);
    expect(isExpert("B@Y.org", "a@x.org b@y.org")).toBe(true);
    expect(isExpert(null, "a@x.org")).toBe(false);
  });
});

describe("on-device labels", () => {
  it("parses label formats and PlantVillage names", () => {
    expect(parseLabels({ "1": "b", "0": "a" })).toEqual(["a", "b"]);
    expect(formatLabel("Tomato___Late_blight")).toEqual({ crop: "Tomato", condition: "Late blight", healthy: false });
    expect(formatLabel("Apple___healthy").healthy).toBe(true);
  });

  it("ranks logits as probabilities", () => {
    const [top] = topPredictions([0.1, 3, 0.2], ["A___x", "B___y", "C___z"], 1);
    expect(top.label).toBe("B___y");
    expect(top.confidence).toBeGreaterThan(0.8);
  });
});

describe("estimateYield", () => {
  it("applies disease and NDVI factors to the base yield", () => {
    const y = estimateYield({ crop: "Wheat", areaHa: 2, sowingDate: "2026-01-01", recentSeverity: "high", ndvi: 0.45 });
    expect(y.perHa).toBeCloseTo(3.5 * 0.75 * 0.9, 2);
    expect(y.total).toBeCloseTo(y.perHa! * 2, 1);
    expect(y.basis).toBe("heuristic");
    expect(y.harvestDate).not.toBeNull();
  });

  it("returns nulls for unknown crops", () => {
    expect(estimateYield({ crop: "Dragonfruit", areaHa: 1, sowingDate: null }).perHa).toBeNull();
  });
});
