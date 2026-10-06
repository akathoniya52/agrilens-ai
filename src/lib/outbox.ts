/**
 * Offline outbox (IndexedDB) for chat text messages. Queue with `queueMessage` while offline;
 * `flushOutbox` replays them in order when back online and emits OUTBOX_EVENT on window.
 * Client-only.
 */

export interface OutboxItem {
  id?: number;
  chatId: string;
  content: string;
  /** Idempotency key sent with the POST; items queued by older builds may lack it. */
  clientId?: string;
  createdAt: string;
}

export interface FlushResult {
  sent: number;
  dropped: number;
  remaining: number;
  chatIds: string[];
  /** HTTP status that stopped the flush with items kept for a later retry (e.g. 402, 429, 5xx). */
  blockedStatus: number | null;
}

export type OutboxOutcome = "delivered" | "drop" | "retry";

/**
 * 2xx (a streamed answer, or `{status: "answered"}` for a resent clientId) and 409 `unanswered` (saved,
 * the user can tap Regenerate) count as delivered, as does any other 409. 409 `busy` (another answer is
 * being generated in that chat) is retried. Only 400/404 are permanently undeliverable. Everything else
 * (401, 402, 408, 429, 5xx, …) keeps the item and stops the flush.
 */
export function classifyOutboxStatus(status: number, code?: string | null): OutboxOutcome {
  if (status === 409) return code === "busy" ? "retry" : "delivered";
  if (status >= 200 && status < 300) return "delivered";
  if (status === 400 || status === 404) return "drop";
  return "retry";
}

/** Window event fired after a flush; `detail: FlushResult`. Also fired with remaining count after queueing. */
export const OUTBOX_EVENT = "agrilens:outbox";

const DB_NAME = "agrilens";
const STORE = "outbox";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export function outboxSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

export async function listOutbox(chatId?: string): Promise<OutboxItem[]> {
  const items = await withStore<OutboxItem[]>("readonly", (store) => store.getAll());
  return chatId ? items.filter((item) => item.chatId === chatId) : items;
}

function emit(detail: FlushResult) {
  window.dispatchEvent(new CustomEvent<FlushResult>(OUTBOX_EVENT, { detail }));
}

export async function queueMessage(chatId: string, content: string, clientId: string): Promise<OutboxItem> {
  const item: OutboxItem = { chatId, content, clientId, createdAt: new Date().toISOString() };
  const id = await withStore<IDBValidKey>("readwrite", (store) => store.add(item));
  const remaining = (await listOutbox()).length;
  emit({ sent: 0, dropped: 0, remaining, chatIds: [], blockedStatus: null });
  return { ...item, id: Number(id) };
}

export async function removeOutbox(id: number): Promise<void> {
  await withStore("readwrite", (store) => store.delete(id));
}

async function errorCode(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    return typeof body === "object" && body !== null && "code" in body && typeof body.code === "string" ? body.code : null;
  } catch {
    return null;
  }
}

const isNdjson = (res: Response) => res.headers.get("content-type")?.includes("application/x-ndjson") ?? false;

async function drain(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return;
  while (!(await reader.read()).done) {
    /* consume the NDJSON stream so the server finishes and persists the answer */
  }
}

let flushing: Promise<FlushResult> | null = null;

async function doFlush(): Promise<FlushResult> {
  const items = (await listOutbox()).sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  const result: FlushResult = { sent: 0, dropped: 0, remaining: items.length, chatIds: [], blockedStatus: null };
  for (const item of items) {
    let res: Response;
    try {
      res = await fetch(`/api/chats/${item.chatId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: item.content, ...(item.clientId && { clientId: item.clientId }) }),
      });
    } catch {
      break;
    }
    const outcome = classifyOutboxStatus(res.status, res.status === 409 ? await errorCode(res) : null);
    if (outcome === "retry") {
      result.blockedStatus = res.status;
      break;
    }
    if (outcome === "delivered") {
      if (res.ok && isNdjson(res)) {
        await drain(res).catch((error: unknown) => console.error("Outbox stream drain failed:", error));
      }
      result.sent += 1;
      if (!result.chatIds.includes(item.chatId)) result.chatIds.push(item.chatId);
    } else {
      result.dropped += 1;
    }
    if (item.id !== undefined) await removeOutbox(item.id);
    result.remaining -= 1;
  }
  emit(result);
  return result;
}

/** Web Locks keep two tabs from replaying the same items concurrently. */
function lockedFlush(): Promise<FlushResult> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    // The lock is held until doFlush settles; `then` unwraps the nested promise in the lib typing.
    return navigator.locks.request("agrilens-outbox", () => doFlush()).then((result) => result);
  }
  return doFlush();
}

export function flushOutbox(): Promise<FlushResult> {
  flushing ??= lockedFlush().finally(() => {
    flushing = null;
  });
  return flushing;
}
