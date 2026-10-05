import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";
import { IRRIGATION_TYPES, SOIL_TYPES, type GeoPoint, type IrrigationType, type SoilType } from "@/types/farm";
import { PointSchema } from "./geo-schemas";

export interface IFarm {
  userId: Types.ObjectId;
  name: string;
  location?: GeoPoint | null;
  crops: string[];
  areaHa?: number | null;
  soilType?: SoilType | null;
  irrigation?: IrrigationType | null;
  createdAt: Date;
  updatedAt: Date;
}

export type FarmDoc = HydratedDocument<IFarm>;

const FarmSchema = new Schema<IFarm>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    location: { type: PointSchema, default: undefined },
    crops: { type: [String], default: [] },
    areaHa: { type: Number, default: null },
    soilType: { type: String, enum: [...SOIL_TYPES, null], default: null },
    irrigation: { type: String, enum: [...IRRIGATION_TYPES, null], default: null },
  },
  { timestamps: true }
);

FarmSchema.index({ userId: 1, createdAt: -1 });
FarmSchema.index({ location: "2dsphere" }, { sparse: true });

export const Farm = (models.Farm as Model<IFarm>) || model<IFarm>("Farm", FarmSchema);
