import { describe, expect, it } from "vitest";
import { buildRagContext, usedCitations } from "@/lib/rag";
import { chunkText, cosineSimilarity, topKByCosine } from "@/lib/vector";

describe("cosineSimilarity", () => {
  it("handles identical, orthogonal, opposite and degenerate vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([1], [1, 2])).toBe(0);
  });
});

describe("topKByCosine", () => {
  it("ranks, filters by minScore and limits", () => {
    const items = [
      { id: "a", embedding: [1, 0] },
      { id: "b", embedding: [0.9, 0.1] },
      { id: "c", embedding: [0, 1] },
      { id: "d", embedding: [-1, 0] },
    ];
    const top = topKByCosine([1, 0], items, 2, 0.5);
    expect(top.map((t) => t.id)).toEqual(["a", "b"]);
    expect(topKByCosine([1, 0], items, 10, 0.5)).toHaveLength(2);
  });
});

describe("chunkText", () => {
  it("returns a single chunk for short text and splits long text with bounded size", () => {
    expect(chunkText("  short  ")).toEqual(["short"]);
    expect(chunkText("")).toEqual([]);
    const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} about wheat rust control.`).join(" ");
    const chunks = chunkText(long, 300, 50);
    expect(chunks.length).toBeGreaterThan(3);
    expect(chunks.every((c) => c.length <= 360)).toBe(true);
  });
});

describe("RAG citations", () => {
  it("numbers citations per source and keeps only cited ones", () => {
    const { section, citations } = buildRagContext([
      { source: "a.md", title: "A", url: null, text: "one", score: 0.9 },
      { source: "b.md", title: "B", url: "https://b", text: "two", score: 0.8 },
      { source: "a.md", title: "A", url: null, text: "three", score: 0.7 },
    ]);
    expect(citations.map((c) => c.n)).toEqual([1, 2]);
    expect(section?.content).toContain("[1] A\nthree");
    expect(usedCitations("See [2].", citations)).toEqual([{ n: 2, title: "B", source: "b.md", url: "https://b" }]);
    expect(buildRagContext([])).toEqual({ section: null, citations: [] });
  });
});
