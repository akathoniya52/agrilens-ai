import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";

export interface IChat {
  userId: Types.ObjectId;
  title: string;
  lastMessageAt: Date;
  summary: string;
  summarizedUpTo: Date | null;
  /** Set while an answer is being generated (see acquireGenerationLock); stale after 90 s. */
  generatingAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ChatDoc = HydratedDocument<IChat>;

export const DEFAULT_CHAT_TITLE = "New chat";

const ChatSchema = new Schema<IChat>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, default: DEFAULT_CHAT_TITLE },
    lastMessageAt: { type: Date, default: Date.now },
    summary: { type: String, default: "" },
    summarizedUpTo: { type: Date, default: null },
    generatingAt: { type: Date, default: undefined },
  },
  { timestamps: true }
);

ChatSchema.index({ userId: 1, lastMessageAt: -1 });

export const Chat = (models.Chat as Model<IChat>) || model<IChat>("Chat", ChatSchema);
