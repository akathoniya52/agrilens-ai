import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";

export interface IPushSubscription {
  userId: Types.ObjectId;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type PushSubscriptionDoc = HydratedDocument<IPushSubscription>;

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true }
);

PushSubscriptionSchema.index({ userId: 1 });

export const PushSubscriptionModel =
  (models.PushSubscription as Model<IPushSubscription>) ||
  model<IPushSubscription>("PushSubscription", PushSubscriptionSchema);
