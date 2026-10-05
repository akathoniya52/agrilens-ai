import type { Attachment, ChatMessage, ChatSummary, Feedback } from "@/types/chat";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  const body: unknown = await res.json().catch(() => null);
  const message =
    typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
      ? body.error
      : `Request failed (${res.status})`;
  return new ApiError(message, res.status);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

const json = (method: string, body: unknown, signal?: AbortSignal): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
  signal,
});

export function listChats(query: string, signal?: AbortSignal) {
  const qs = query ? `?q=${encodeURIComponent(query)}` : "";
  return request<ChatSummary[]>(`/api/chats${qs}`, { signal });
}

export function createChat() {
  return request<ChatSummary>("/api/chats", json("POST", {}));
}

export function renameChat(chatId: string, title: string) {
  return request<ChatSummary>(`/api/chats/${chatId}`, json("PATCH", { title }));
}

export function deleteChat(chatId: string) {
  return request<{ success: boolean }>(`/api/chats/${chatId}`, { method: "DELETE" });
}

export function listMessages(chatId: string, signal?: AbortSignal) {
  return request<ChatMessage[]>(`/api/chats/${chatId}/messages`, { signal });
}

export interface PostMessageBody {
  content: string;
  attachments?: Attachment[];
  regenerate?: boolean;
  clientId?: string;
}

/** Returns the raw NDJSON response; read it with `readEventStream`. */
export function postMessage(chatId: string, body: PostMessageBody, signal: AbortSignal) {
  return fetch(`/api/chats/${chatId}/messages`, json("POST", body, signal));
}

export function sendFeedback(messageId: string, feedback: Feedback) {
  return request<ChatMessage>(`/api/messages/${messageId}/feedback`, json("PATCH", { feedback }));
}

export function uploadImage(file: Blob, name: string, signal?: AbortSignal) {
  const form = new FormData();
  form.append("file", file, name);
  return request<Attachment>("/api/upload", { method: "POST", body: form, signal });
}

export function transcribeAudio(audio: Blob, language: string) {
  const form = new FormData();
  const ext = audio.type.includes("mp4") ? "m4a" : audio.type.includes("ogg") ? "ogg" : "webm";
  form.append("audio", audio, `voice.${ext}`);
  form.append("language", language);
  return request<{ text: string; credits: number }>("/api/transcribe", { method: "POST", body: form });
}
