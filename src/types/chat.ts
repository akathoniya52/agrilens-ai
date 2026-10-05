export type Severity = "none" | "low" | "moderate" | "high" | "critical";

/** Normalized 0–1 coordinates, top-left origin. */
export interface BoundingBox {
  label: string;
  confidence: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Diagnosis {
  crop: string;
  condition: string;
  /** 0–1 */
  confidence: number;
  severity: Severity;
  affectedAreaPct: number;
  boxes: BoundingBox[];
}

export interface Attachment {
  url: string;
  type: string;
  width?: number;
  height?: number;
}

export interface Citation {
  /** 1-based marker used in the answer text, e.g. [1]. */
  n: number;
  title: string;
  source: string;
  url?: string | null;
}

export type MessageRole = "user" | "assistant" | "system";
export type Feedback = "up" | "down" | null;

export interface ChatMessage {
  _id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  attachments?: Attachment[];
  diagnosis?: Diagnosis | null;
  feedback?: Feedback;
  followUps?: string[];
  citations?: Citation[];
  createdAt: string;
}

export interface ChatSummary {
  _id: string;
  title: string;
  lastMessageAt: string;
  createdAt: string;
}

export type StreamEvent =
  | { type: "meta"; userMsg: ChatMessage }
  | { type: "delta"; text: string }
  | { type: "diagnosis"; diagnosis: Diagnosis }
  | {
      type: "done";
      assistantMsg: ChatMessage;
      chat: { _id: string; title: string };
      followUps: string[];
      credits: number;
    }
  | { type: "tool"; name: string }
  | { type: "error"; error: string };
