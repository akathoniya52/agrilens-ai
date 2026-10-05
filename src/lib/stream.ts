import type { StreamEvent } from "@/types/chat";

// Client-safe: no server-only imports. Shared by the messages route and the chat UI.

export const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
} as const;

const encoder = new TextEncoder();

export function encodeEvent(event: StreamEvent): Uint8Array {
  return encoder.encode(`${JSON.stringify(event)}\n`);
}

function isStreamEvent(value: unknown): value is StreamEvent {
  return typeof value === "object" && value !== null && "type" in value
    && typeof value.type === "string";
}

export function parseEventLine(line: string): StreamEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return isStreamEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createEventLineParser() {
  let buffer = "";

  const drain = (lines: string[]) =>
    lines.map(parseEventLine).filter((e): e is StreamEvent => e !== null);

  return {
    push(chunk: string): StreamEvent[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      return drain(lines);
    },
    flush(): StreamEvent[] {
      const rest = buffer;
      buffer = "";
      return drain([rest]);
    },
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `Request failed (${response.status})`;
  const text = await response.text();
  try {
    const body: unknown = JSON.parse(text);
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
      return body.error;
    }
    return fallback;
  } catch {
    return text || fallback;
  }
}

/**
 * Reads an NDJSON StreamEvent response. Non-2xx JSON responses (e.g. 402) are surfaced
 * as a single `{ type: "error" }` event. Resolves when the stream ends.
 */
export async function readEventStream(
  response: Response,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  if (!response.ok) {
    onEvent({ type: "error", error: await readErrorMessage(response) });
    return;
  }
  if (!response.body) {
    onEvent({ type: "error", error: "Empty response body" });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createEventLineParser();

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(decoder.decode(value, { stream: true })).forEach(onEvent);
  }
  parser.push(decoder.decode()).forEach(onEvent);
  parser.flush().forEach(onEvent);
}
