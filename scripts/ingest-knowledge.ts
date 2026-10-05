/**
 * Embeds agronomy reference docs into the Knowledge collection for RAG.
 *
 *   npx tsx scripts/ingest-knowledge.ts ./knowledge
 *
 * Reads .md/.txt files (recursively). Title = first "# heading" or file name. An optional
 * first line `url: https://…` sets the citation link. Re-running replaces a file's chunks.
 */
import { config } from "dotenv";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import mongoose from "mongoose";

config({ path: ".env.local" });
config();

const BATCH = 50;

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return listFiles(full);
      return Promise.resolve(/\.(md|markdown|txt)$/i.test(e.name) ? [full] : []);
    })
  );
  return nested.flat();
}

function parseDoc(raw: string, file: string) {
  let body = raw;
  let url: string | null = null;
  const urlLine = /^url:\s*(\S+)\s*\n/i.exec(body);
  if (urlLine) {
    url = urlLine[1];
    body = body.slice(urlLine[0].length);
  }
  const heading = /^#\s+(.+)$/m.exec(body);
  const title = heading?.[1].trim() || path.basename(file).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  return { title, url, body };
}

async function main() {
  const dir = path.resolve(process.argv[2] ?? "knowledge");
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set");
  if (!process.env.GOOGLE_API_KEY) throw new Error("GOOGLE_API_KEY is not set");

  const { Knowledge } = await import("../src/lib/models/Knowledge");
  const { embedTexts } = await import("../src/lib/rag");
  const { chunkText } = await import("../src/lib/vector");

  await mongoose.connect(process.env.MONGODB_URI);
  const files = await listFiles(dir);
  if (!files.length) console.warn(`No .md/.txt files found in ${dir}`);

  let total = 0;
  for (const file of files) {
    const source = path.relative(dir, file);
    const { title, url, body } = parseDoc(await readFile(file, "utf8"), file);
    const chunks = chunkText(body);
    const embeddings: number[][] = [];
    for (let i = 0; i < chunks.length; i += BATCH) {
      embeddings.push(...(await embedTexts(chunks.slice(i, i + BATCH), "RETRIEVAL_DOCUMENT")));
    }
    await Knowledge.deleteMany({ source });
    await Knowledge.insertMany(
      chunks.map((text, chunkIndex) => ({ source, title, url, chunkIndex, text, embedding: embeddings[chunkIndex] }))
    );
    total += chunks.length;
    console.log(`✓ ${source}: ${chunks.length} chunks`);
  }
  console.log(`Ingested ${total} chunks from ${files.length} files.`);
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
