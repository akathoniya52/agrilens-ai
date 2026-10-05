import { Schema } from "mongoose";
import type { GeoPoint, GeoPolygon } from "@/types/farm";

export const PointSchema = new Schema<GeoPoint>(
  {
    type: { type: String, enum: ["Point"], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false }
);

export const PolygonSchema = new Schema<GeoPolygon>(
  {
    type: { type: String, enum: ["Polygon"], required: true },
    coordinates: { type: [[[Number]]], required: true },
  },
  { _id: false }
);
