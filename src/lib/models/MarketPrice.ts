import { Schema, model, models, type HydratedDocument, type Model } from "mongoose";

/** Daily mandi price snapshot; data.gov.in only serves recent days, so history accumulates here. */
export interface IMarketPrice {
  commodity: string;
  state: string;
  district: string;
  market: string;
  variety: string;
  date: Date;
  min: number;
  max: number;
  modal: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MarketPriceDoc = HydratedDocument<IMarketPrice>;

const MarketPriceSchema = new Schema<IMarketPrice>(
  {
    commodity: { type: String, required: true, lowercase: true, trim: true },
    state: { type: String, default: "" },
    district: { type: String, default: "" },
    market: { type: String, default: "" },
    variety: { type: String, default: "" },
    date: { type: Date, required: true },
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    modal: { type: Number, required: true },
  },
  { timestamps: true }
);

MarketPriceSchema.index({ commodity: 1, state: 1, district: 1, market: 1, variety: 1, date: 1 }, { unique: true });
MarketPriceSchema.index({ commodity: 1, date: -1 });

export const MarketPrice =
  (models.MarketPrice as Model<IMarketPrice>) || model<IMarketPrice>("MarketPrice", MarketPriceSchema);
