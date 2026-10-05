import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";
import type { Attachment, Citation, Diagnosis, Feedback, MessageRole } from "@/types/chat";

export interface IMessage {
  chatId: Types.ObjectId;
  userId?: Types.ObjectId | null; // null for assistant
  role: MessageRole;
  content: string;
  attachments: Attachment[];
  diagnosis?: Diagnosis | null;
  feedback?: Feedback;
  followUps: string[];
  citations: Citation[];
  /** Client-generated id of a user message; makes POST retries idempotent per chat. */
  clientId?: string;
  /** Inbound WhatsApp message id; webhook redeliveries are ignored. */
  externalId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MessageDoc = HydratedDocument<IMessage>;

const AttachmentSchema = new Schema<Attachment>(
  {
    url: { type: String, required: true },
    type: { type: String, required: true },
    width: Number,
    height: Number,
  },
  { _id: false }
);

const BoxSchema = new Schema(
  {
    label: String,
    confidence: Number,
    x: Number,
    y: Number,
    w: Number,
    h: Number,
  },
  { _id: false }
);

const DiagnosisSchema = new Schema<Diagnosis>(
  {
    crop: String,
    condition: String,
    confidence: Number,
    severity: { type: String, enum: ["none", "low", "moderate", "high", "critical"] },
    affectedAreaPct: Number,
    boxes: { type: [BoxSchema], default: [] },
  },
  { _id: false }
);

const CitationSchema = new Schema<Citation>(
  {
    n: { type: Number, required: true },
    title: { type: String, required: true },
    source: { type: String, required: true },
    url: { type: String, default: null },
  },
  { _id: false }
);

const MessageSchema = new Schema<IMessage>(
  {
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, default: "" },
    attachments: { type: [AttachmentSchema], default: [] },
    diagnosis: { type: DiagnosisSchema, default: null },
    feedback: { type: String, enum: ["up", "down", null], default: null },
    followUps: { type: [String], default: [] },
    citations: { type: [CitationSchema], default: [] },
    clientId: { type: String, default: undefined },
    externalId: { type: String, default: undefined },
  },
  { timestamps: true }
);

MessageSchema.index({ chatId: 1, createdAt: -1 });
MessageSchema.index({ chatId: 1, clientId: 1 }, { unique: true, partialFilterExpression: { clientId: { $type: "string" } } });
MessageSchema.index({ externalId: 1 }, { unique: true, sparse: true });

export const Message =
  (models.Message as Model<IMessage>) || model<IMessage>("Message", MessageSchema);
