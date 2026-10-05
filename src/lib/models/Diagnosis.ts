import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";
import type { Severity } from "@/types/chat";
import type { GeoPoint } from "@/types/farm";
import { PointSchema } from "./geo-schemas";

/** Denormalized diagnosis record for analytics, field history and (Phase 4) outbreak radar. */
export interface IDiagnosisRecord {
  userId: Types.ObjectId;
  chatId: Types.ObjectId;
  messageId: Types.ObjectId;
  sourceMessageId?: Types.ObjectId | null;
  farmId?: Types.ObjectId | null;
  fieldId?: Types.ObjectId | null;
  crop: string;
  condition: string;
  severity: Severity;
  confidence: number;
  location?: GeoPoint | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DiagnosisRecordDoc = HydratedDocument<IDiagnosisRecord>;

const DiagnosisRecordSchema = new Schema<IDiagnosisRecord>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    chatId: { type: Schema.Types.ObjectId, ref: "Chat", required: true },
    messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
    sourceMessageId: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", default: null },
    fieldId: { type: Schema.Types.ObjectId, ref: "Field", default: null },
    crop: { type: String, default: "" },
    condition: { type: String, default: "" },
    severity: { type: String, enum: ["none", "low", "moderate", "high", "critical"], default: "none" },
    confidence: { type: Number, default: 0 },
    location: { type: PointSchema, default: undefined },
  },
  { timestamps: true }
);

DiagnosisRecordSchema.index({ userId: 1, createdAt: -1 });
DiagnosisRecordSchema.index({ farmId: 1, createdAt: -1 });
DiagnosisRecordSchema.index({ fieldId: 1, createdAt: -1 });
DiagnosisRecordSchema.index({ location: "2dsphere" }, { sparse: true });

export const DiagnosisRecord =
  (models.Diagnosis as Model<IDiagnosisRecord>) ||
  model<IDiagnosisRecord>("Diagnosis", DiagnosisRecordSchema);
