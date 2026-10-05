export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function topKByCosine<T extends { embedding: number[] }>(
  query: number[],
  items: T[],
  k: number,
  minScore = 0
): Array<T & { score: number }> {
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(query, item.embedding) }))
    .filter((item) => item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

/** Splits text into ~`size`-char chunks on paragraph/sentence boundaries with `overlap` chars of carry-over. */
export function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const units = clean.split(/(?<=\n\n)|(?<=[.!?])\s+/).filter((u) => u.trim());
  const chunks: string[] = [];
  let current = "";
  for (const unit of units) {
    if (current && current.length + unit.length > size) {
      chunks.push(current.trim());
      current = current.slice(Math.max(0, current.length - overlap));
    }
    if (unit.length > size) {
      for (let i = 0; i < unit.length; i += size - overlap) chunks.push(unit.slice(i, i + size).trim());
      current = "";
      continue;
    }
    current += (current && !current.endsWith("\n") ? " " : "") + unit;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
