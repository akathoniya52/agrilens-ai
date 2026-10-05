import { describe, expect, it } from "vitest";
import { HISTORY_LIMIT, buildHistory, type HistoryMessage } from "@/lib/history";
import { buildSystemPrompt } from "@/lib/prompts";

describe("buildHistory", () => {
  it("reverses newest-first messages into oldest-first Gemini contents", () => {
    const newestFirst: HistoryMessage[] = [
      { role: "assistant", content: "A2" },
      { role: "user", content: "U2" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "U1" },
    ];
    expect(buildHistory(newestFirst)).toEqual([
      { role: "user", parts: [{ text: "U1" }] },
      { role: "model", parts: [{ text: "A1" }] },
      { role: "user", parts: [{ text: "U2" }] },
      { role: "model", parts: [{ text: "A2" }] },
    ]);
  });

  it("drops system/empty messages and leading model turns", () => {
    const newestFirst: HistoryMessage[] = [
      { role: "user", content: "U2" },
      { role: "system", content: "sys" },
      { role: "assistant", content: "   " },
      { role: "assistant", content: "A0" },
    ];
    expect(buildHistory(newestFirst)).toEqual([{ role: "user", parts: [{ text: "U2" }] }]);
  });

  it("returns empty history when there is no user turn", () => {
    expect(buildHistory([{ role: "assistant", content: "hi" }])).toEqual([]);
    expect(HISTORY_LIMIT).toBe(10);
  });
});

describe("buildSystemPrompt", () => {
  it("appends the language instruction and non-empty context sections", () => {
    const prompt = buildSystemPrompt({
      language: "hi",
      extraContext: [
        { label: "Farm", content: "2 ha, Gujarat" },
        { label: "Empty", content: "  " },
      ],
    });
    expect(prompt).toContain("You are AgriLens AI");
    expect(prompt).toContain("Respond in Hindi");
    expect(prompt).toContain("### Farm\n2 ha, Gujarat");
    expect(prompt).not.toContain("### Empty");
  });

  it("defaults to English", () => {
    expect(buildSystemPrompt()).toContain("Respond in English");
  });
});
