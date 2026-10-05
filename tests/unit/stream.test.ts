import { describe, expect, it } from "vitest";
import { createEventLineParser, encodeEvent, parseEventLine, readEventStream } from "@/lib/stream";
import type { StreamEvent } from "@/types/chat";

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe("stream helpers", () => {
  it("encodes one JSON object per line", () => {
    const text = decode(encodeEvent({ type: "delta", text: "hi\nthere" }));
    expect(text.endsWith("\n")).toBe(true);
    expect(text.trimEnd().split("\n")).toHaveLength(1);
    expect(parseEventLine(text)).toEqual({ type: "delta", text: "hi\nthere" });
  });

  it("ignores blank and malformed lines", () => {
    expect(parseEventLine("")).toBeNull();
    expect(parseEventLine("{not json")).toBeNull();
    expect(parseEventLine('{"foo":1}')).toBeNull();
  });

  it("reassembles events split across chunks", () => {
    const parser = createEventLineParser();
    const wire = decode(encodeEvent({ type: "delta", text: "a" })) + decode(encodeEvent({ type: "delta", text: "b" }));
    const events = [...parser.push(wire.slice(0, 7)), ...parser.push(wire.slice(7, 30)), ...parser.push(wire.slice(30))];
    expect([...events, ...parser.flush()]).toEqual([
      { type: "delta", text: "a" },
      { type: "delta", text: "b" },
    ]);
  });

  it("round-trips a Response body through readEventStream", async () => {
    const sent: StreamEvent[] = [
      { type: "delta", text: "नमस्ते" },
      { type: "error", error: "boom" },
    ];
    const bytes = new Uint8Array(sent.flatMap((e) => [...encodeEvent(e)]));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 5));
        controller.enqueue(bytes.slice(5));
        controller.close();
      },
    });
    const received: StreamEvent[] = [];
    await readEventStream(new Response(body), (e) => received.push(e));
    expect(received).toEqual(sent);
  });

  it("surfaces non-2xx JSON errors as an error event", async () => {
    const received: StreamEvent[] = [];
    const res = new Response(JSON.stringify({ error: "Out of credits" }), { status: 402 });
    await readEventStream(res, (e) => received.push(e));
    expect(received).toEqual([{ type: "error", error: "Out of credits" }]);
  });
});
