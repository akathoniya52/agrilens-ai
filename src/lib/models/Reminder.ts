import { Schema, model, models, Types, type HydratedDocument, type Model } from "mongoose";
import { REMINDER_KINDS, type ReminderKind } from "@/types/farm";

export interface IReminder {
  userId: Types.ObjectId;
  farmId?: Types.ObjectId | null;
  fieldId?: Types.ObjectId | null;
  title: string;
  dueAt: Date;
  kind: ReminderKind;
  done: boolean;
  notifiedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type ReminderDoc = HydratedDocument<IReminder>;

const ReminderSchema = new Schema<IReminder>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    farmId: { type: Schema.Types.ObjectId, ref: "Farm", default: null },
    fieldId: { type: Schema.Types.ObjectId, ref: "Field", default: null },
    title: { type: String, required: true, trim: true },
    dueAt: { type: Date, required: true },
    kind: { type: String, enum: REMINDER_KINDS, default: "custom" },
    done: { type: Boolean, default: false },
    notifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

ReminderSchema.index({ userId: 1, done: 1, dueAt: 1 });
ReminderSchema.index({ done: 1, notifiedAt: 1, dueAt: 1 });

export const Reminder =
  (models.Reminder as Model<IReminder>) || model<IReminder>("Reminder", ReminderSchema);
