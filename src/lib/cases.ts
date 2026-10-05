import type { Types } from "mongoose";
import type { ICase } from "@/lib/models/Case";
import type { CaseDTO } from "@/types/insights";

export function expertEmails(raw = process.env.EXPERT_EMAILS ?? ""): Set<string> {
  return new Set(
    raw
      .split(/[,\s;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export const isExpert = (email: string | null | undefined, raw?: string) =>
  Boolean(email) && expertEmails(raw).has((email ?? "").trim().toLowerCase());

type LeanCase = ICase & { _id: Types.ObjectId };
type Owner = { name?: string | null; email: string };

export function serializeCase(c: LeanCase, owner?: Owner): CaseDTO {
  return {
    _id: c._id.toString(),
    chatId: c.chatId.toString(),
    messageId: c.messageId.toString(),
    status: c.status,
    question: c.snapshot?.question ?? "",
    answer: c.snapshot?.answer ?? "",
    imageUrls: [...(c.snapshot?.imageUrls ?? [])],
    diagnosis: c.snapshot?.diagnosis
      ? {
          crop: c.snapshot.diagnosis.crop,
          condition: c.snapshot.diagnosis.condition,
          severity: c.snapshot.diagnosis.severity,
          confidence: c.snapshot.diagnosis.confidence,
        }
      : null,
    assignedTo: c.assignedTo ?? null,
    notes: (c.notes ?? []).map((n) => ({ author: n.author, role: n.role, text: n.text, at: new Date(n.at).toISOString() })),
    ...(owner && { owner: { name: owner.name ?? null, email: owner.email } }),
    createdAt: new Date(c.createdAt).toISOString(),
    updatedAt: new Date(c.updatedAt).toISOString(),
  };
}
