import type { Types } from "mongoose";
import { User } from "@/lib/models/User";

export const AI_CREDIT_COST = 1;

export function canAfford(credits: number | null | undefined, cost = AI_CREDIT_COST): boolean {
  return typeof credits === "number" && credits >= cost;
}

export function creditGuardFilter(userId: Types.ObjectId | string, cost = AI_CREDIT_COST) {
  return { _id: userId, credits: { $gte: cost } };
}

/** Atomically deducts credits. Returns the remaining balance, or null when insufficient. */
export async function consumeCredits(
  userId: Types.ObjectId | string,
  cost = AI_CREDIT_COST
): Promise<number | null> {
  const updated = await User.findOneAndUpdate(
    creditGuardFilter(userId, cost),
    { $inc: { credits: -cost } },
    { new: true, projection: { credits: 1 } }
  ).lean();
  return updated ? updated.credits : null;
}

export async function refundCredits(
  userId: Types.ObjectId | string,
  cost = AI_CREDIT_COST
): Promise<void> {
  await User.updateOne({ _id: userId }, { $inc: { credits: cost } });
}
