import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";
import { DEFAULT_LANGUAGE } from "@/lib/languages";

export type Theme = "dark" | "daylight";

export interface NotificationPrefs {
  weatherAlerts: boolean;
  reminders: boolean;
  pushSubscription?: unknown;
}

export interface IUser {
  name?: string;
  email: string;
  image?: string;
  credits: number;
  providerId?: string;
  language: string;
  theme: Theme;
  activeFarmId?: Types.ObjectId | null;
  notificationPrefs: NotificationPrefs;
  /** Digits-only E.164 (no "+"), used to map WhatsApp senders to accounts. Only set once verified. */
  phone?: string | null;
  /** Number awaiting verification: the owner must WhatsApp the code to the bot from it. */
  pendingPhone?: string | null;
  phoneCodeHash?: string | null;
  phoneCodeExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDoc = HydratedDocument<IUser>;

const NotificationPrefsSchema = new Schema<NotificationPrefs>(
  {
    weatherAlerts: { type: Boolean, default: true },
    reminders: { type: Boolean, default: true },
    pushSubscription: { type: Schema.Types.Mixed, default: null },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name: String,
    email: { type: String, unique: true, required: true },
    image: String,
    credits: { type: Number, default: 100 }, // starter credits
    providerId: String,                      // Google sub id
    language: { type: String, default: DEFAULT_LANGUAGE },
    theme: { type: String, enum: ["dark", "daylight"], default: "dark" },
    activeFarmId: { type: Schema.Types.ObjectId, ref: "Farm", default: null },
    notificationPrefs: { type: NotificationPrefsSchema, default: () => ({}) },
    phone: { type: String, default: undefined },
    pendingPhone: { type: String, default: undefined },
    phoneCodeHash: { type: String, default: undefined },
    phoneCodeExpiresAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

UserSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });
UserSchema.index({ pendingPhone: 1 }, { partialFilterExpression: { pendingPhone: { $type: "string" } } });

export const User = (models.User as Model<IUser>) || model<IUser>("User", UserSchema);
