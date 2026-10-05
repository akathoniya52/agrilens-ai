import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";

export interface ISensorReading {
  fieldId: Types.ObjectId;
  userId: Types.ObjectId;
  ts: Date;
  soilMoisture?: number | null;
  soilTemp?: number | null;
  airTemp?: number | null;
  humidity?: number | null;
  battery?: number | null;
  deviceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type SensorReadingDoc = HydratedDocument<ISensorReading>;

const RETENTION_SECONDS = 180 * 24 * 60 * 60;

const SensorReadingSchema = new Schema<ISensorReading>(
  {
    fieldId: { type: Schema.Types.ObjectId, ref: "Field", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    ts: { type: Date, required: true },
    soilMoisture: { type: Number, default: null },
    soilTemp: { type: Number, default: null },
    airTemp: { type: Number, default: null },
    humidity: { type: Number, default: null },
    battery: { type: Number, default: null },
    deviceId: { type: String, default: null },
  },
  { timestamps: true }
);

SensorReadingSchema.index({ fieldId: 1, ts: -1 });
SensorReadingSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

export const SensorReading =
  (models.SensorReading as Model<ISensorReading>) || model<ISensorReading>("SensorReading", SensorReadingSchema);
