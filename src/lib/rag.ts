import { getGenAI } from "@/lib/gemini";
import { Knowledge } from "@/lib/models/Knowledge";
import type { ContextSection } from "@/lib/prompts";
import { topKByCosine } from "@/lib/vector";
import type { Citation } from "@/types/chat";

export const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL || "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
const TOP_K = 4;
const MIN_SCORE = 0.55;
const FALLBACK_LIMIT = Number(process.env.RAG_FALLBACK_LIMIT) || 2000;
const PRESENCE_TTL_MS = 5 * 60 * 1000;

type TaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(texts: string[], taskType: TaskType): Promise<number[][]> {
  if (!texts.length) return [];
  const res = await getGenAI().models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: { taskType, outputDimensionality: EMBEDDING_DIMENSIONS },
  });
  const vectors = (res.embeddings ?? []).map((e) => e.values ?? []);
  if (vectors.length !== texts.length || vectors.some((v) => !v.length)) throw new Error("Embedding response incomplete");
  return vectors;
}

export interface RetrievedChunk {
  source: string;
  title: string;
  url: string | null;
  text: string;
  score: number;
}

let presence: { at: number; has: boolean } | null = null;

async function hasKnowledge(): Promise<boolean> {
  if (presence && Date.now() - presence.at < PRESENCE_TTL_MS) return presence.has;
  const has = (await Knowledge.estimatedDocumentCount()) > 0;
  presence = { at: Date.now(), has };
  return has;
}

async function atlasSearch(vector: number[], index: string): Promise<RetrievedChunk[]> {
  const rows = await Knowledge.aggregate<RetrievedChunk>([
    { $vectorSearch: { index, path: "embedding", queryVector: vector, numCandidates: 100, limit: TOP_K } },
    { $project: { _id: 0, source: 1, title: 1, url: 1, text: 1, score: { $meta: "vectorSearchScore" } } },
  ]);
  return rows.filter((r) => r.score >= MIN_SCORE);
}

async function memorySearch(vector: number[]): Promise<RetrievedChunk[]> {
  const docs = await Knowledge.find().select("source title url text embedding").limit(FALLBACK_LIMIT).lean();
  return topKByCosine(vector, docs, TOP_K, MIN_SCORE).map((d) => ({
    source: d.source,
    title: d.title,
    url: d.url ?? null,
    text: d.text,
    score: d.score,
  }));
}

export async function retrieve(query: string): Promise<RetrievedChunk[]> {
  if (!query.trim() || !(await hasKnowledge())) return [];
  const [vector] = await embedTexts([query.slice(0, 2000)], "RETRIEVAL_QUERY");
  const index = process.env.ATLAS_VECTOR_INDEX;
  if (index) {
    try {
      return await atlasSearch(vector, index);
    } catch (error) {
      console.warn("AgriLens $vectorSearch failed, using in-memory cosine:", error instanceof Error ? error.message : error);
    }
  }
  return memorySearch(vector);
}

export function buildRagContext(chunks: RetrievedChunk[]): { section: ContextSection | null; citations: Citation[] } {
  if (!chunks.length) return { section: null, citations: [] };
  const citations: Citation[] = [];
  const bySource = new Map<string, number>();
  const blocks = chunks.map((chunk) => {
    let n = bySource.get(chunk.source);
    if (!n) {
      n = citations.length + 1;
      bySource.set(chunk.source, n);
      citations.push({ n, title: chunk.title, source: chunk.source, url: chunk.url });
    }
    return `[${n}] ${chunk.title}\n${chunk.text.trim()}`;
  });
  return {
    section: {
      label: "Verified agronomy references",
      content: [
        "Ground your answer in these excerpts when relevant and cite them inline as [n]. Do not invent citations; if they don't cover the question, answer normally without citing.",
        ...blocks,
      ].join("\n\n"),
    },
    citations,
  };
}

/** Never throws: retrieval failures just mean an ungrounded answer. */
export async function ragContext(query: string): Promise<{ section: ContextSection | null; citations: Citation[] }> {
  try {
    return buildRagContext(await retrieve(query));
  } catch (error) {
    console.error("AgriLens RAG retrieval failed:", error);
    return { section: null, citations: [] };
  }
}

/** Keeps only citations whose [n] marker actually appears in the answer. */
export function usedCitations(answer: string, citations: Citation[]): Citation[] {
  return citations.filter((c) => answer.includes(`[${c.n}]`));
}
