import { runAnswer, type AnswerOutcome } from "@/lib/answer";
import { consumeCredits, refundCredits } from "@/lib/credits";
import { isDuplicateKey } from "@/lib/http";
import { imageDimensions } from "@/lib/image-dimensions";
import { baseMimeType, isAllowedImageType, MAX_IMAGE_BYTES, toDataUrl } from "@/lib/media";
import { Chat } from "@/lib/models/Chat";
import { Message } from "@/lib/models/Message";
import { User } from "@/lib/models/User";
import { connectDB } from "@/lib/mongodb";
import { extractPhoneCode, verifyPhoneCode } from "@/lib/phone-link";
import type { Attachment, StreamEvent } from "@/types/chat";
import { downloadWhatsAppMedia, sendWhatsAppText, type InboundMessage, type WhatsAppConfig } from "@/lib/whatsapp";

const CHAT_TITLE = "WhatsApp";
const DEDUPE_LIMIT = 500;
/** All work for one webhook call (download, answer, post-steps, reply) must end within the 60 s function limit. */
export const WEBHOOK_BUDGET_MS = 55_000;
/** Kept back from the answer for sending the reply. */
const REPLY_RESERVE_MS = 6_000;
const MIN_STEP_MS = 1_000;
const STILL_WORKING_REPLY = "⏳ This is taking longer than usual, so I stopped. Please ask again. Your credit was refunded.";
const seen = new Set<string>();

const appUrl = () => process.env.NEXTAUTH_URL ?? "the AgriLens app";

/** Signal for one step: aborts when the remaining budget (until `deadline`) runs out. */
const budgetSignal = (deadline: number) => AbortSignal.timeout(Math.max(MIN_STEP_MS, deadline - Date.now()));

function markSeen(id: string): boolean {
  if (seen.has(id)) return false;
  seen.add(id);
  if (seen.size > DEDUPE_LIMIT) seen.delete(seen.values().next().value ?? id);
  return true;
}

async function imageAttachment(config: WhatsAppConfig, mediaId: string, signal: AbortSignal): Promise<Attachment | null> {
  const { data, mimeType } = await downloadWhatsAppMedia(config, mediaId, MAX_IMAGE_BYTES, signal);
  const type = baseMimeType(mimeType);
  if (!isAllowedImageType(type)) return null;
  const dimensions = (await imageDimensions(data)) ?? {};
  return { url: toDataUrl(data, type), type, ...dimensions };
}

type LinkResult = "linked" | "taken" | null;

/** Completes a pending link when the sender WhatsApps the code shown in Settings from that number. */
async function tryLinkPhone(inbound: InboundMessage): Promise<LinkResult> {
  const code = extractPhoneCode(inbound.text);
  if (!code || inbound.imageId) return null;
  const candidates = await User.find({ pendingPhone: inbound.from, phoneCodeExpiresAt: { $gt: new Date() } })
    .select("_id pendingPhone phoneCodeHash phoneCodeExpiresAt")
    .lean();
  const match = candidates.find((candidate) => verifyPhoneCode(candidate, inbound.from, code));
  if (!match) return null;
  try {
    const result = await User.updateOne(
      { _id: match._id, pendingPhone: inbound.from },
      { $set: { phone: inbound.from }, $unset: { pendingPhone: 1, phoneCodeHash: 1, phoneCodeExpiresAt: 1 } }
    );
    return result.matchedCount > 0 ? "linked" : null;
  } catch (error) {
    if (isDuplicateKey(error)) return "taken";
    throw error;
  }
}

/**
 * Returns the reply text, or null when this inbound message was already handled (redelivery).
 * The consumed credit is refunded at most once: by runAnswer when it produced no answer, or here when
 * the deadline cut off an answer runAnswer had kept.
 */
async function answer(userId: string, inbound: InboundMessage, attachments: Attachment[], deadline: number): Promise<string | null> {
  const user = await User.findById(userId);
  if (!user) return "Account not found.";
  const credits = await consumeCredits(user._id);
  if (credits === null) return `You have run out of AgriLens credits. Top up in ${appUrl()}.`;

  let text = "";
  let error: string | null = null;
  let delegated = false;
  let outcome: AnswerOutcome;
  const answerDeadline = deadline - REPLY_RESERVE_MS;
  const signal = budgetSignal(answerDeadline);
  try {
    const chat =
      (await Chat.findOne({ userId: user._id, title: CHAT_TITLE }).sort({ lastMessageAt: -1 })) ??
      (await Chat.create({ userId: user._id, title: CHAT_TITLE }));
    const userMsg = await Message.create({
      chatId: chat._id,
      userId: user._id,
      role: "user",
      content: inbound.text,
      attachments,
      externalId: inbound.id,
    }).catch((failure: unknown) => {
      if (isDuplicateKey(failure)) return null;
      throw failure;
    });
    if (!userMsg) {
      await refundCredits(user._id);
      return null;
    }
    chat.lastMessageAt = new Date();
    await chat.save();

    const send = (event: StreamEvent) => {
      if (event.type === "done") text = event.assistantMsg.content;
      else if (event.type === "delta") text += event.text;
      else if (event.type === "error") error = event.error;
    };
    delegated = true;
    outcome = await runAnswer(
      { user, chat, userMsg, credits, isFirstMessage: false, deadline: answerDeadline },
      send,
      signal
    );
  } catch (failure) {
    console.error("AgriLens WhatsApp answer failed:", failure);
    // Once runAnswer owns the turn it settles credits itself (refund on no text).
    if (!delegated) await refundCredits(user._id);
    return "Sorry, something went wrong. Please try again.";
  }
  if (signal.aborted && outcome !== "answered") {
    if (outcome === "partial") await refundCredits(user._id);
    return STILL_WORKING_REPLY;
  }
  return text || error || "Sorry, I could not answer that. Your credit was refunded.";
}

/**
 * Handles one inbound WhatsApp message end-to-end (runs after the webhook has returned 200).
 * `markSeen` is the in-memory fast path; the unique `externalId` on Message is the durable dedupe.
 */
export async function handleInbound(config: WhatsAppConfig, inbound: InboundMessage, deadline: number): Promise<void> {
  if (!markSeen(inbound.id)) return;
  try {
    await connectDB();
    const linked = await tryLinkPhone(inbound);
    if (linked) {
      await sendWhatsAppText(
        config,
        inbound.from,
        linked === "linked"
          ? "✅ Your WhatsApp number is now linked to AgriLens. Send a question or a crop photo any time."
          : "This number is already linked to another AgriLens account. Remove it there first, then request a new code.",
        budgetSignal(deadline)
      );
      return;
    }
    const user = await User.findOne({ phone: inbound.from }).select("_id").lean();
    if (!user) {
      await sendWhatsAppText(
        config,
        inbound.from,
        `Welcome to AgriLens AI 🌱 This number isn't linked yet. Sign in at ${appUrl()}, open Settings, enter this WhatsApp number (with country code) and send the 6-digit code shown there to this chat.`,
        budgetSignal(deadline)
      );
      return;
    }
    let attachments: Attachment[] = [];
    if (inbound.imageId) {
      const image = await imageAttachment(config, inbound.imageId, budgetSignal(deadline - REPLY_RESERVE_MS)).catch(
        (error: unknown) => {
          console.error("AgriLens WhatsApp media download failed:", error);
          return null;
        }
      );
      if (image) attachments = [image];
    }
    if (!inbound.text && !attachments.length) {
      const prompt = inbound.imageId
        ? "Sorry, I couldn't open that photo. Please send it again (JPEG or PNG, under 4 MB)."
        : "Please send a question or a clear photo of the affected crop.";
      await sendWhatsAppText(config, inbound.from, prompt, budgetSignal(deadline));
      return;
    }
    const reply = await answer(user._id.toString(), inbound, attachments, deadline);
    if (reply) await sendWhatsAppText(config, inbound.from, reply, budgetSignal(deadline + REPLY_RESERVE_MS / 2));
  } catch (error) {
    console.error("AgriLens WhatsApp handling failed:", error);
  }
}
