import type { Types } from "mongoose";
import type { Attachment, ChatMessage, ChatSummary, Citation, Diagnosis, MessageRole } from "@/types/chat";
import type { IUser } from "@/lib/models/User";

type Id = Types.ObjectId | string;

export interface MessageLike {
  _id: Id;
  chatId: Id;
  role: MessageRole;
  content?: string | null;
  attachments?: Attachment[] | null;
  diagnosis?: Diagnosis | null;
  feedback?: "up" | "down" | null;
  followUps?: string[] | null;
  citations?: Citation[] | null;
  createdAt: Date | string;
}

export interface ChatLike {
  _id: Id;
  title: string;
  lastMessageAt?: Date | string | null;
  createdAt: Date | string;
}

const toIso = (value: Date | string) => new Date(value).toISOString();

function serializeDiagnosis(diagnosis: Diagnosis | null | undefined): Diagnosis | null {
  if (!diagnosis) return null;
  return {
    crop: diagnosis.crop,
    condition: diagnosis.condition,
    confidence: diagnosis.confidence,
    severity: diagnosis.severity,
    affectedAreaPct: diagnosis.affectedAreaPct,
    boxes: (diagnosis.boxes ?? []).map(({ label, confidence, x, y, w, h }) => ({
      label, confidence, x, y, w, h,
    })),
  };
}

export function serializeMessage(msg: MessageLike): ChatMessage {
  return {
    _id: msg._id.toString(),
    chatId: msg.chatId.toString(),
    role: msg.role,
    content: msg.content ?? "",
    attachments: (msg.attachments ?? []).map(({ url, type, width, height }) => ({
      url,
      type,
      ...(width != null && { width }),
      ...(height != null && { height }),
    })),
    diagnosis: serializeDiagnosis(msg.diagnosis),
    feedback: msg.feedback ?? null,
    followUps: [...(msg.followUps ?? [])],
    ...(msg.citations?.length
      ? { citations: msg.citations.map(({ n, title, source, url }) => ({ n, title, source, url: url ?? null })) }
      : {}),
    createdAt: toIso(msg.createdAt),
  };
}

export function serializeChat(chat: ChatLike): ChatSummary {
  return {
    _id: chat._id.toString(),
    title: chat.title,
    lastMessageAt: toIso(chat.lastMessageAt ?? chat.createdAt),
    createdAt: toIso(chat.createdAt),
  };
}

function pendingPhone(user: IUser, now = Date.now()) {
  const expiresAt = user.phoneCodeExpiresAt;
  const active = Boolean(user.pendingPhone && expiresAt && expiresAt.getTime() > now);
  return {
    pendingPhone: active ? user.pendingPhone ?? null : null,
    pendingPhoneExpiresAt: active && expiresAt ? expiresAt.toISOString() : null,
  };
}

export function serializeMe(user: IUser & { _id: Id }) {
  return {
    _id: user._id.toString(),
    name: user.name ?? null,
    email: user.email,
    image: user.image ?? null,
    credits: user.credits,
    language: user.language,
    theme: user.theme,
    activeFarmId: user.activeFarmId ? user.activeFarmId.toString() : null,
    notificationPrefs: {
      weatherAlerts: user.notificationPrefs?.weatherAlerts ?? true,
      reminders: user.notificationPrefs?.reminders ?? true,
      pushSubscription: user.notificationPrefs?.pushSubscription ?? null,
    },
    phone: user.phone ?? null,
    ...pendingPhone(user),
    createdAt: toIso(user.createdAt),
  };
}
