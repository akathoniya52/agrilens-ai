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

  it("keeps image-only user turns and the diagnosis of the answer", () => {
    const newestFirst: HistoryMessage[] = [
      { role: "user", content: "How do I treat it?" },
      {
        role: "assistant",
        content: "This looks like early blight.",
        diagnosis: {
          crop: "Tomato",
          condition: "Early blight",
          confidence: 0.82,
          severity: "moderate",
          affectedAreaPct: 15,
          boxes: [],
        },
      },
      { role: "user", content: "", attachments: [{ type: "image/jpeg" }] },
    ];
    expect(buildHistory(newestFirst)).toEqual([
      { role: "user", parts: [{ text: "[Sent 1 crop photo]" }] },
      {
        role: "model",
        parts: [
          {
            text: "[Image diagnosis: Tomato — Early blight, severity moderate, ~15% affected, confidence 82%]\nThis looks like early blight.",
          },
        ],
      },
      { role: "user", parts: [{ text: "How do I treat it?" }] },
    ]);
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
