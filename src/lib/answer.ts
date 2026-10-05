import type { Content, Part } from "@google/genai";
import { AGENT_TOOL_DECLARATIONS, executeAgentTool } from "@/lib/agent-tools";
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
/** Budget for diagnosis/follow-ups/title/summary after the answer text is already saved. */
const POST_STEPS_TIMEOUT_MS = 8_000;

export interface AnswerTurn {
  user: UserDoc;
  chat: ChatDoc;
  userMsg: MessageDoc;
  isFirstMessage: boolean;
  credits: number;
  /** Regenerate: previous assistant answers, deleted only once the new answer is saved. */
  replaceIds?: string[];
}

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

async function safeImageParts(userMsg: MessageDoc, userId: string): Promise<Part[]> {
  return loadImageParts(userMsg.attachments, userId).catch((error: unknown) => {
    console.error("AgriLens image loading failed:", error);
    return [];
  });
}

async function streamText(
  contents: Content[],
  turn: AnswerTurn,
  send: Send,
  signal: AbortSignal,
  farm: ContextSection[] = []
) {
  let text = "";
  let failure: unknown = null;
  try {
    for await (const delta of streamAgriAnswer({
      contents,
      language: turn.user.language,
      extraContext: [...summaryContext(turn.chat), ...farm],
      signal,
      tools: {
        declarations: AGENT_TOOL_DECLARATIONS,
        execute: (name, args) => executeAgentTool(turn.user, name, args),
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
  extras: { diagnosis?: Diagnosis | null; followUps?: string[]; citations?: Citation[] } = {}
) {
  return Message.create({
    chatId: turn.chat._id,
    role: "assistant",
    content,
    diagnosis: extras.diagnosis ?? null,
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

async function finishAborted(turn: AnswerTurn, text: string) {
  await persistAssistant(turn, text);
  await deleteReplaced(turn).catch(logFailure("replace previous answer"));
  if (turn.isFirstMessage) turn.chat.title = fallbackTitle(turn.userMsg.content);
  turn.chat.lastMessageAt = new Date();
  await turn.chat.save();
}

/** Runs one AI turn, emitting StreamEvents. Refunds credits when no text was produced. */
export async function runAnswer(turn: AnswerTurn, send: Send, signal: AbortSignal) {
  const { user, chat, userMsg } = turn;
  const question = userMsg.content;
  send({ type: "meta", userMsg: serializeMessage(userMsg) });

  let creditsSettled = false;
  try {
    const [history, imageParts, farm, rag] = await Promise.all([
      loadHistory(userMsg),
      safeImageParts(userMsg, user._id.toString()),
      farmContext(user),
      ragContext(question),
    ]);

    const diagnosisPromise = imageParts.length
      ? generateDiagnosis({ imageParts, question, language: user.language })
          .then((diagnosis) => {
            if (diagnosis && !signal.aborted) send({ type: "diagnosis", diagnosis });
            return diagnosis;
          })
          .catch(logFailure("diagnosis"))
      : Promise.resolve(null);
    const titlePromise = turn.isFirstMessage
      ? generateChatTitle(question || "Crop image diagnosis", user.language).catch(logFailure("title"))
      : Promise.resolve(null);

    const contents: Content[] = [
      ...history,
      { role: "user", parts: [...imageParts, { text: question.trim() || IMAGE_ONLY_PROMPT }] },
    ];
    const grounding = rag.section ? [...farm, rag.section] : farm;
    const { text, failure } = await streamText(contents, turn, send, signal, grounding);
    creditsSettled = true;

    if (!text) {
      await refundCredits(user._id);
      if (failure) logFailure("answer stream")(failure);
      if (!signal.aborted) send({ type: "error", error: "The AI could not generate a response. Your credit was refunded." });
      return;
    }
    if (failure) logFailure("answer stream (partial)")(failure);

    if (signal.aborted) {
      await finishAborted(turn, text);
      return;
    }

    // Persist the answer first so a timeout in the optional post-steps can never lose it.
    const assistantMsg = await persistAssistant(turn, text, { citations: usedCitations(text, rag.citations) });
    await deleteReplaced(turn).catch(logFailure("replace previous answer"));

    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, POST_STEPS_TIMEOUT_MS);
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
    const followUps = settled(followUpsResult, []);
    assistantMsg.diagnosis = diagnosis;
    assistantMsg.followUps = followUps;
    await Message.updateOne({ _id: assistantMsg._id }, { $set: { diagnosis, followUps } }).catch(
      logFailure("assistant post-steps update")
    );
    if (diagnosis) {
      await recordDiagnosis({ user, chat, userMsg, assistantMsg, diagnosis }).catch(logFailure("diagnosis record"));
    }

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
  } catch (error) {
    if (!creditsSettled) await refundCredits(user._id);
    throw error;
  }
}

export function createAnswerStream(
  run: (send: Send, signal: AbortSignal) => Promise<void>,
  requestSignal: AbortSignal
): ReadableStream<Uint8Array> {
  const abort = new AbortController();
  const onRequestAbort = () => abort.abort();
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
