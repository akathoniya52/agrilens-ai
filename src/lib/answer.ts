import type { Content, Part } from "@google/genai";
import { after } from "next/server";
import { agentToolDeclarations, asksForReminder, executeAgentTool } from "@/lib/agent-tools";
import type { ChatDoc } from "@/lib/models/Chat";
import { DEFAULT_CHAT_TITLE } from "@/lib/models/Chat";
import { Message, type MessageDoc } from "@/lib/models/Message";
import type { UserDoc } from "@/lib/models/User";
import { loadHistory, summaryContext, updateRollingSummary } from "@/lib/chat-service";
import { refundCredits } from "@/lib/credits";
import { recordDiagnosis } from "@/lib/diagnosis-records";
import { DiagnosisRecord } from "@/lib/models/Diagnosis";
import { farmContext } from "@/lib/farm-context";
import {
  generateChatTitle,
  generateDiagnosis,
  generateFollowUps,
  streamAgriAnswer,
} from "@/lib/gemini";
import { loadImageParts } from "@/lib/media";
import type { ContextSection } from "@/lib/prompts";
import { ragContext, usedCitations } from "@/lib/rag";
import { serializeMessage } from "@/lib/serialize";
import { encodeEvent } from "@/lib/stream";
import { fallbackTitle } from "@/lib/text";
import type { Citation, Diagnosis, StreamEvent } from "@/types/chat";

const IMAGE_ONLY_PROMPT = "Please analyze the attached crop image(s).";
/** Budget for follow-ups/title/summary after the answer text is already saved. */
const POST_STEPS_TIMEOUT_MS = 8_000;

export interface AnswerTurn {
  user: UserDoc;
  chat: ChatDoc;
  userMsg: MessageDoc;
  isFirstMessage: boolean;
  credits: number;
  /** Regenerate: previous assistant answers, deleted only once the new answer is saved. */
  replaceIds?: string[];
  /** Epoch ms by which the post-steps must finish (e.g. the WhatsApp webhook budget). */
  deadline?: number;
}

/** What happened to the turn's credit: kept for a saved full/partial answer, or refunded exactly once. */
export type AnswerOutcome = "answered" | "partial" | "refunded";

type Send = (event: StreamEvent) => void;

function logFailure(context: string) {
  return (error: unknown) => {
    console.error(`AgriLens ${context} failed:`, error);
    return null;
  };
}

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

/** Keeps `task` alive past the response (Next's `after`), so the function isn't frozen mid-write. */
function runAfterResponse(task: Promise<unknown>) {
  try {
    after(task);
  } catch (error) {
    console.warn("AgriLens after() unavailable, task runs untracked:", error instanceof Error ? error.message : error);
  }
}

function userPrompt(question: string, failedImages: number): string {
  const note = failedImages ? `\n\n(${failedImages} attached image(s) couldn't be loaded.)` : "";
  return `${question.trim() || IMAGE_ONLY_PROMPT}${note}`;
}

async function streamText(
  contents: Content[],
  turn: AnswerTurn,
  send: Send,
  signal: AbortSignal,
  farm: ContextSection[] = []
) {
  const allowReminder = asksForReminder(turn.userMsg.content);
  let text = "";
  let failure: unknown = null;
  try {
    for await (const delta of streamAgriAnswer({
      contents,
      language: turn.user.language,
      timeZone: turn.user.timeZone,
      extraContext: [...summaryContext(turn.chat), ...farm],
      signal,
      tools: {
        declarations: agentToolDeclarations({ allowReminder }),
        execute: (name, args, toolSignal) =>
          executeAgentTool(turn.user, name, args, { allowReminder, signal: toolSignal ?? signal }),
        onCall: (name) => send({ type: "tool", name }),
      },
    })) {
      text += delta;
      send({ type: "delta", text: delta });
    }
  } catch (error) {
    if (!signal.aborted) failure = error;
  }
  return { text, failure };
}

async function persistAssistant(
  turn: AnswerTurn,
  content: string,
  extras: { followUps?: string[]; citations?: Citation[] } = {}
) {
  return Message.create({
    chatId: turn.chat._id,
    role: "assistant",
    content,
    diagnosis: null,
    followUps: extras.followUps ?? [],
    citations: extras.citations ?? [],
  });
}

async function deleteReplaced(turn: AnswerTurn) {
  const ids = turn.replaceIds ?? [];
  if (!ids.length) return;
  await Promise.all([
    Message.deleteMany({ _id: { $in: ids }, chatId: turn.chat._id, role: "assistant" }),
    DiagnosisRecord.deleteMany({ sourceMessageId: turn.userMsg._id, messageId: { $in: ids } }),
  ]);
}

function withDeadline<T>(promise: Promise<T>, deadline: Promise<void>, fallback: T): Promise<T> {
  return Promise.race([promise, deadline.then(() => fallback)]);
}

async function finishAborted(turn: AnswerTurn) {
  await deleteReplaced(turn).catch(logFailure("replace previous answer"));
  if (turn.isFirstMessage) turn.chat.title = fallbackTitle(turn.userMsg.content);
  turn.chat.lastMessageAt = new Date();
  await turn.chat.save();
}

/**
 * Saves the diagnosis on the assistant message as soon as both exist, independently of the post-step
 * deadline, and only then shows it to the client. Runs via `after()` so the response cutoff can't drop it.
 */
function saveDiagnosisWhenReady(
  turn: AnswerTurn,
  imageParts: Part[],
  assistantSaved: Promise<MessageDoc | null>,
  send: Send
): Promise<Diagnosis | null> {
  const { user, chat, userMsg } = turn;
  const task = generateDiagnosis({ imageParts, question: userMsg.content, language: user.language })
    .then(async (diagnosis) => {
      const assistantMsg = await assistantSaved;
      if (!diagnosis || !assistantMsg) return null;
      const result = await Message.updateOne({ _id: assistantMsg._id, chatId: chat._id }, { $set: { diagnosis } });
      if (result.matchedCount === 0) return null;
      assistantMsg.diagnosis = diagnosis;
      send({ type: "diagnosis", diagnosis });
      await recordDiagnosis({ user, chat, userMsg, assistantMsg, diagnosis }).catch(logFailure("diagnosis record"));
      return diagnosis;
    })
    .catch(logFailure("diagnosis"));
  runAfterResponse(task);
  return task;
}

/** Runs one AI turn, emitting StreamEvents. The consumed credit is refunded unless an answer was saved. */
export async function runAnswer(turn: AnswerTurn, send: Send, signal: AbortSignal): Promise<AnswerOutcome> {
  const { user, chat, userMsg } = turn;
  const question = userMsg.content;
  send({ type: "meta", userMsg: serializeMessage(userMsg) });

  let creditsSettled = false;
  const refund = async () => {
    if (creditsSettled) return;
    creditsSettled = true;
    await refundCredits(user._id);
  };
  let resolveSaved: (msg: MessageDoc | null) => void = () => undefined;
  const assistantSaved = new Promise<MessageDoc | null>((resolve) => {
    resolveSaved = resolve;
  });

  try {
    const [history, images, farm, rag] = await Promise.all([
      loadHistory(userMsg, chat),
      loadImageParts(userMsg.attachments, user._id.toString()),
      farmContext(user),
      ragContext(question),
    ]);

    if (!images.parts.length && images.failed && !question.trim()) {
      await refund();
      if (!signal.aborted) {
        send({ type: "error", error: "The image could not be loaded. Please attach it again. Your credit was refunded." });
      }
      return "refunded";
    }

    const diagnosisPromise = images.parts.length
      ? saveDiagnosisWhenReady(turn, images.parts, assistantSaved, send)
      : Promise.resolve(null);
    const titlePromise = turn.isFirstMessage
      ? generateChatTitle(question || "Crop image diagnosis", user.language).catch(logFailure("title"))
      : Promise.resolve(null);

    const contents: Content[] = [
      ...history,
      { role: "user", parts: [...images.parts, { text: userPrompt(question, images.failed) }] },
    ];
    const grounding = rag.section ? [...farm, rag.section] : farm;
    const { text, failure } = await streamText(contents, turn, send, signal, grounding);

    if (!text) {
      await refund();
      if (failure) logFailure("answer stream")(failure);
      if (!signal.aborted) send({ type: "error", error: "The AI could not generate a response. Your credit was refunded." });
      return "refunded";
    }
    if (failure) logFailure("answer stream (partial)")(failure);

    if (signal.aborted) {
      const partial = await persistAssistant(turn, text);
      creditsSettled = true;
      resolveSaved(partial);
      await finishAborted(turn);
      return "partial";
    }

    // Persist the answer first so a timeout in the optional post-steps can never lose it.
    let assistantMsg: MessageDoc;
    try {
      assistantMsg = await persistAssistant(turn, text, { citations: usedCitations(text, rag.citations) });
    } catch (error) {
      logFailure("assistant save")(error);
      await refund();
      send({ type: "error", error: "Your answer could not be saved. Your credit was refunded." });
      return "refunded";
    }
    creditsSettled = true;
    resolveSaved(assistantMsg);
    await deleteReplaced(turn).catch(logFailure("replace previous answer"));

    const budget = Math.max(0, Math.min(POST_STEPS_TIMEOUT_MS, (turn.deadline ?? Infinity) - Date.now()));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budget);
    });
    const [diagnosisResult, followUpsResult, titleResult, summaryResult] = await Promise.allSettled([
      withDeadline(diagnosisPromise, deadline, null),
      withDeadline(
        generateFollowUps({ question: question || IMAGE_ONLY_PROMPT, answer: text, language: user.language }),
        deadline,
        []
      ),
      withDeadline(titlePromise, deadline, null),
      withDeadline(updateRollingSummary(chat, user.language), deadline, false),
    ]);
    clearTimeout(timer);
    if (followUpsResult.status === "rejected") logFailure("follow-ups")(followUpsResult.reason);
    if (summaryResult.status === "rejected") logFailure("summary")(summaryResult.reason);

    const diagnosis = settled(diagnosisResult, null);
    if (diagnosis) assistantMsg.diagnosis = diagnosis;
    const followUps = settled(followUpsResult, []);
    assistantMsg.followUps = followUps;
    await Message.updateOne({ _id: assistantMsg._id, chatId: chat._id }, { $set: { followUps } }).catch(
      logFailure("assistant follow-ups update")
    );

    if (turn.isFirstMessage && chat.title === DEFAULT_CHAT_TITLE) {
      chat.title = settled(titleResult, null) ?? fallbackTitle(question);
    }
    chat.lastMessageAt = new Date();
    await chat.save().catch(logFailure("chat update"));

    send({
      type: "done",
      assistantMsg: serializeMessage(assistantMsg),
      chat: { _id: chat._id.toString(), title: chat.title },
      followUps,
      credits: turn.credits,
    });
    return "answered";
  } catch (error) {
    await refund();
    throw error;
  } finally {
    resolveSaved(null);
  }
}

export function createAnswerStream(
  run: (send: Send, signal: AbortSignal) => Promise<unknown>,
  requestSignal: AbortSignal
): ReadableStream<Uint8Array> {
  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
  if (requestSignal.aborted) abort.abort();
  requestSignal.addEventListener("abort", onRequestAbort, { once: true });
  let closed = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const send: Send = (event) => {
        if (!closed) controller.enqueue(encodeEvent(event));
      };
      try {
        await run(send, abort.signal);
      } catch (error) {
        console.error("Error in AI answer stream:", error);
        send({ type: "error", error: "Failed to process message. Please try again." });
      } finally {
        requestSignal.removeEventListener("abort", onRequestAbort);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
}
