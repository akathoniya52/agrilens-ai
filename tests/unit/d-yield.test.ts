import { describe, expect, it } from "vitest";
import { buildCropCalendar } from "@/lib/crop-calendar";
import { estimateYield } from "@/lib/yield";

describe("estimateYield harvest date", () => {
  it("matches the crop calendar's harvest task (cotton: first picking on day 155, not day 180)", () => {
    const sowingDate = "2026-01-01";
    const harvestTask = buildCropCalendar("Cotton", sowingDate).tasks.find((task) => task.kind === "harvest");
    const { harvestDate } = estimateYield({ crop: "Cotton", areaHa: 1, sowingDate });
    expect(harvestDate).toBe(harvestTask?.date);
    expect(harvestDate).toBe("2026-06-05T00:00:00.000Z");
  });

  it("uses each crop's harvest task, including crops without a base yield", () => {
    expect(estimateYield({ crop: "Wheat", areaHa: 1, sowingDate: "2026-01-01" }).harvestDate).toBe("2026-05-01T00:00:00.000Z");
    expect(estimateYield({ crop: "Dragonfruit", areaHa: 1, sowingDate: "2026-01-01" }).harvestDate).toBe("2026-04-26T00:00:00.000Z");
  });

  it("is null without a sowing date", () => {
    expect(estimateYield({ crop: "Cotton", areaHa: 1, sowingDate: null }).harvestDate).toBeNull();
  });
});
