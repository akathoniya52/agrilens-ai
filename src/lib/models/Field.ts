import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";
import type { GeoPolygon } from "@/types/farm";
import { PolygonSchema } from "./geo-schemas";

export interface IField {
  farmId: Types.ObjectId;
  userId: Types.ObjectId;
  name: string;
  crop: string;
  sowingDate?: Date | null;
  boundary?: GeoPolygon | null;
  areaHa?: number | null;
  /** SHA-256 of the IoT device token; the plaintext is shown once on creation. */
  iotTokenHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type FieldDoc = HydratedDocument<IField>;

const FieldSchema = new Schema<IField>(
  {
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    crop: { type: String, default: "", trim: true },
    sowingDate: { type: Date, default: null },
    boundary: { type: PolygonSchema, default: undefined },
    areaHa: { type: Number, default: null },
    iotTokenHash: { type: String, default: null },
  },
  { timestamps: true }
);

FieldSchema.index({ farmId: 1, createdAt: 1 });
FieldSchema.index({ userId: 1 });
FieldSchema.index({ boundary: "2dsphere" }, { sparse: true });

export const Field = (models.Field as Model<IField>) || model<IField>("Field", FieldSchema);
