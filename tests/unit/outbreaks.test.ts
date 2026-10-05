import { describe, expect, it } from "vitest";
import {
  aggregateOutbreaks,
  bandCount,
  cellsCoveringCircle,
  gridCell,
  haversineKm,
  isReportable,
  weekStart,
  type OutbreakInput,
} from "@/lib/outbreaks";

const at = new Date("2026-09-01T00:00:00Z");
const rec = (userId: string, overrides: Partial<OutbreakInput> = {}): OutbreakInput => ({
  userId,
  condition: "Late blight",
  crop: "Tomato",
  severity: "moderate",
  location: [72.571, 23.022],
  createdAt: at,
  ...overrides,
});

describe("gridCell", () => {
  it("snaps nearby points to the same rounded centre", () => {
    const a = gridCell([72.571, 23.022]);
    const b = gridCell([72.599, 23.001]);
    expect(a.id).toBe(b.id);
    expect(a.center).toEqual([72.55, 23.05]);
  });
});

describe("isReportable", () => {
  it("ignores healthy and severity none", () => {
    expect(isReportable("Healthy", "low")).toBe(false);
    expect(isReportable("Rust", "none")).toBe(false);
    expect(isReportable("Rust", "low")).toBe(true);
  });
});

describe("aggregateOutbreaks", () => {
  it("suppresses groups with fewer than k distinct users", () => {
    const records = [rec("u1"), rec("u1"), rec("u2"), rec("u3"), rec("u4")];
    const cells = aggregateOutbreaks(records, { k: 5 });
    expect(cells).toHaveLength(0);
  });

  it("publishes groups with k distinct users without leaking ids or exact points", () => {
    const records = ["u1", "u2", "u3", "u4", "u5"].map((u, i) =>
      rec(u, { severity: i === 2 ? "critical" : "low", condition: i % 2 ? "late  BLIGHT" : "Late blight" })
    );
    const cells = aggregateOutbreaks(records, { k: 5 });
    expect(cells).toHaveLength(1);
    const [cell] = cells;
    expect(cell).toMatchObject({ condition: "late blight", crop: "tomato", users: 5, cases: "5–9", severity: "critical" });
    expect(cell.latest).toBe("2026-08-31");
    expect(cell).not.toHaveProperty("suppressed");
    expect(cell.center).toEqual([72.55, 23.05]);
    expect(JSON.stringify(cell)).not.toContain("u1");
  });

  it("keeps different conditions and cells apart", () => {
    const users = ["a", "b", "c", "d", "e"];
    const records = [
      ...users.map((u) => rec(u)),
      ...users.map((u) => rec(u, { condition: "Rust" })),
      ...users.slice(0, 4).map((u) => rec(u, { location: [75.1, 20.1] })),
    ];
    const cells = aggregateOutbreaks(records, { k: 5 });
    expect(cells.map((c) => c.condition).sort()).toEqual(["late blight", "rust"]);
  });

  it("only counts records inside the requested cells", () => {
    const records = ["a", "b", "c", "d", "e"].map((u) => rec(u));
    expect(aggregateOutbreaks(records, { cellIds: new Set(["0:0"]) })).toHaveLength(0);
    expect(aggregateOutbreaks(records, { cellIds: new Set([gridCell([72.571, 23.022]).id]) })).toHaveLength(1);
  });
});

describe("bandCount", () => {
  it("bands report counts", () => {
    expect([1, 4, 5, 9, 10, 24, 25, 400].map(bandCount)).toEqual(["1–4", "1–4", "5–9", "5–9", "10–24", "10–24", "25+", "25+"]);
  });
});

describe("weekStart", () => {
  it("rounds to the Monday of the UTC week", () => {
    expect(weekStart(new Date("2026-09-03T15:00:00Z"))).toBe("2026-08-31");
    expect(weekStart(new Date("2026-08-31T00:00:00Z"))).toBe("2026-08-31");
    expect(weekStart(new Date("2026-09-06T23:59:00Z"))).toBe("2026-08-31");
  });
});

describe("cellsCoveringCircle", () => {
  it("includes whole cells that overlap the circle, even if their centre is outside", () => {
    const center: [number, number] = [72.58, 23.05];
    const { ids, queryRadiusKm } = cellsCoveringCircle(center, 5);
    expect(ids.has(gridCell(center).id)).toBe(true);
    expect(ids.has(gridCell([72.65, 23.05]).id)).toBe(true);
    expect(ids.has(gridCell([72.95, 23.05]).id)).toBe(false);
    expect(queryRadiusKm).toBeGreaterThan(5 + 15);
  });

  it("covers every cell whose points fall within the radius", () => {
    const center: [number, number] = [78.123, 21.456];
    const { ids, queryRadiusKm } = cellsCoveringCircle(center, 25);
    for (let i = 0; i < 200; i++) {
      const angle = i * 0.37;
      const r = (i % 25) / 111.32;
      const point: [number, number] = [center[0] + r * Math.cos(angle), center[1] + r * Math.sin(angle)];
      if (haversineKm(center, point) <= 25) {
        expect(ids.has(gridCell(point).id)).toBe(true);
        expect(haversineKm(center, point)).toBeLessThanOrEqual(queryRadiusKm);
      }
    }
  });
});
