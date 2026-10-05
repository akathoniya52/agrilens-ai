import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";
import type { CaseNote, CaseStatus } from "@/types/insights";
import type { Severity } from "@/types/chat";

export interface CaseSnapshot {
  question: string;
  answer: string;
  imageUrls: string[];
  diagnosis: { crop: string; condition: string; severity: Severity; confidence: number } | null;
}

export interface ICase {
  userId: Types.ObjectId;
  chatId: Types.ObjectId;
  messageId: Types.ObjectId;
  status: CaseStatus;
  snapshot: CaseSnapshot;
  assignedTo?: string | null;
  notes: Array<Omit<CaseNote, "at"> & { at: Date }>;
  createdAt: Date;
  updatedAt: Date;
}

export type CaseDoc = HydratedDocument<ICase>;

const NoteSchema = new Schema(
  {
    author: { type: String, required: true },
    role: { type: String, enum: ["farmer", "expert"], required: true },
    text: { type: String, required: true, maxlength: 4000 },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const SnapshotSchema = new Schema<CaseSnapshot>(
  {
    question: { type: String, default: "" },
    answer: { type: String, default: "" },
    imageUrls: { type: [String], default: [] },
    diagnosis: {
      type: new Schema(
        { crop: String, condition: String, severity: String, confidence: Number },
        { _id: false }
      ),
      default: null,
    },
  },
  { _id: false }
);

const CaseSchema = new Schema<ICase>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
    status: { type: String, enum: ["open", "assigned", "resolved"], default: "open" },
    snapshot: { type: SnapshotSchema, required: true },
    assignedTo: { type: String, default: null },
    notes: { type: [NoteSchema], default: [] },
  },
  { timestamps: true }
);

CaseSchema.index({ userId: 1, createdAt: -1 });
CaseSchema.index({ status: 1, createdAt: -1 });
CaseSchema.index({ messageId: 1 });

export const Case = (models.Case as Model<ICase>) || model<ICase>("Case", CaseSchema);
