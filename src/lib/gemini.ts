import {
  FunctionCallingConfigMode,
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type GenerateContentConfig,
  type Part,
  type Schema,
} from "@google/genai";
import { normalizeDiagnosis } from "@/lib/diagnosis";
import { buildSystemPrompt, languageInstruction, type ContextSection } from "@/lib/prompts";
import { cleanTitle } from "@/lib/text";
import type { Diagnosis } from "@/types/chat";

export { buildSystemPrompt } from "@/lib/prompts";
export type { ContextSection, SystemPromptOptions } from "@/lib/prompts";

export const GEMINI_MODEL = "gemini-2.5-flash";

const FAST_CONFIG: GenerateContentConfig = { thinkingConfig: { thinkingBudget: 0 } };
const MAX_FOLLOW_UPS = 3;

let client: GoogleGenAI | null = null;

export function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set");
  }
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export interface AgentToolkit {
  declarations: FunctionDeclaration[];
  execute: (name: string, args: unknown) => Promise<Record<string, unknown>>;
  onCall?: (name: string) => void;
}

export interface StreamAnswerOptions {
  contents: Content[];
  language?: string | null;
  extraContext?: ContextSection[];
  signal?: AbortSignal;
  /** Enables Gemini function calling; the loop runs at most MAX_TOOL_ROUNDS tool rounds. */
  tools?: AgentToolkit;
}

export const MAX_TOOL_ROUNDS = 4;

const visibleText = (parts: Part[]) =>
  parts.map((part) => (typeof part.text === "string" && !part.thought ? part.text : "")).join("");

async function runToolCalls(calls: FunctionCall[], tools: AgentToolkit): Promise<Part[]> {
  return Promise.all(
    calls.map(async (call) => {
      const name = call.name ?? "";
      tools.onCall?.(name);
      const response = await tools.execute(name, call.args ?? {});
      return { functionResponse: { ...(call.id ? { id: call.id } : {}), name, response } };
    })
  );
}

export async function* streamAgriAnswer({
  contents,
  language,
  extraContext,
  signal,
  tools,
}: StreamAnswerOptions): AsyncGenerator<string> {
  const systemInstruction = buildSystemPrompt({ language, extraContext });
  let history = contents;

  for (let round = 0; ; round++) {
    const toolsEnabled = Boolean(tools) && round < MAX_TOOL_ROUNDS;
    const stream = await getGenAI().models.generateContentStream({
      model: GEMINI_MODEL,
      contents: history,
      config: {
        systemInstruction,
        abortSignal: signal,
        ...(tools && {
          tools: [{ functionDeclarations: tools.declarations }],
          toolConfig: {
            functionCallingConfig: { mode: toolsEnabled ? FunctionCallingConfigMode.AUTO : FunctionCallingConfigMode.NONE },
          },
        }),
      },
    });

    const modelParts: Part[] = [];
    const calls: FunctionCall[] = [];
    for await (const chunk of stream) {
      if (signal?.aborted) return;
      const parts = chunk.candidates?.[0]?.content?.parts ?? [];
      modelParts.push(...parts);
      for (const part of parts) if (part.functionCall) calls.push(part.functionCall);
      const text = visibleText(parts);
      if (text) yield text;
    }

    if (!tools || !toolsEnabled || !calls.length || signal?.aborted) return;
    const responses = await runToolCalls(calls, tools);
    history = [...history, { role: "model", parts: modelParts }, { role: "user", parts: responses }];
  }
}

async function generateText(
  contents: Content[] | Part[] | string,
  systemInstruction: string,
  config: GenerateContentConfig = FAST_CONFIG
): Promise<string> {
  const response = await getGenAI().models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config: { ...config, systemInstruction },
  });
  return response.text?.trim() ?? "";
}

async function generateJson(
  contents: Content[] | Part[] | string,
  systemInstruction: string,
  responseSchema: Schema,
  config: GenerateContentConfig = FAST_CONFIG
): Promise<unknown> {
  const text = await generateText(contents, systemInstruction, {
    ...config,
    responseMimeType: "application/json",
    responseSchema,
  });
  return text ? JSON.parse(text) : null;
}

const DIAGNOSIS_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    crop: { type: Type.STRING, description: "Crop or plant species shown" },
    condition: { type: Type.STRING, description: "Most likely disease, pest, deficiency, or 'Healthy'" },
    confidence: { type: Type.NUMBER, description: "Confidence in the condition, 0 to 1" },
    severity: { type: Type.STRING, enum: ["none", "low", "moderate", "high", "critical"] },
    affectedAreaPct: { type: Type.NUMBER, description: "Visible affected leaf/plant area, 0 to 100" },
    boxes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          confidence: { type: Type.NUMBER },
          box_2d: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
            description: "[ymin, xmin, ymax, xmax] normalized to 0-1000",
          },
        },
        required: ["label", "confidence", "box_2d"],
      },
    },
  },
  required: ["crop", "condition", "confidence", "severity", "affectedAreaPct", "boxes"],
  propertyOrdering: ["crop", "condition", "confidence", "severity", "affectedAreaPct", "boxes"],
};

export async function generateDiagnosis({
  imageParts,
  question,
  language,
}: {
  imageParts: Part[];
  question: string;
  language?: string | null;
}): Promise<Diagnosis | null> {
  if (!imageParts.length) return null;
  const instruction = [
    "You are an expert plant pathologist analyzing crop/leaf/field photos.",
    "Identify the crop and the most likely condition (disease, pest, nutrient deficiency, abiotic stress, or Healthy).",
    "Return bounding boxes around visibly affected regions (max 10) as box_2d [ymin, xmin, ymax, xmax] normalized to 0-1000.",
    "If the plant looks healthy use severity \"none\" and no boxes. Be honest about uncertainty via confidence.",
    `Write crop, condition and box labels in the user's language. ${languageInstruction(language)}`,
  ].join("\n");
  const prompt = question.trim() ? `User note: ${question.trim()}` : "Diagnose this crop image.";

  const raw = await generateJson(
    [{ role: "user", parts: [...imageParts, { text: prompt }] }],
    instruction,
    DIAGNOSIS_SCHEMA,
    {}
  );
  return typeof raw === "object" && raw !== null ? normalizeDiagnosis(raw) : null;
}

export async function generateChatTitle(content: string, language?: string | null): Promise<string | null> {
  const text = await generateText(
    content.slice(0, 2000),
    `Write a concise chat title (at most 6 words) for this farmer's question. Reply with the title only, no quotes or punctuation at the end. ${languageInstruction(language)}`
  );
  return cleanTitle(text);
}

export async function generateFollowUps({
  question,
  answer,
  language,
}: {
  question: string;
  answer: string;
  language?: string | null;
}): Promise<string[]> {
  const raw = await generateJson(
    `Farmer asked:\n${question.slice(0, 2000)}\n\nAssistant answered:\n${answer.slice(0, 6000)}`,
    `Suggest exactly 3 short follow-up questions (max 12 words each) the farmer might ask next, written from the farmer's perspective. ${languageInstruction(language)}`,
    { type: Type.ARRAY, items: { type: Type.STRING } }
  );
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    .map((q) => q.trim().slice(0, 160))
    .slice(0, MAX_FOLLOW_UPS);
}

export async function summarizeConversation({
  previousSummary,
  transcript,
  language,
}: {
  previousSummary: string;
  transcript: string;
  language?: string | null;
}): Promise<string> {
  const input = [
    previousSummary && `Existing summary:\n${previousSummary}`,
    `New messages:\n${transcript}`,
  ].filter(Boolean).join("\n\n");
  return generateText(
    input,
    `Update the running summary of this agriculture advisory conversation. Keep crop names, locations, symptoms, diagnoses, treatments advised and open questions. Max 200 words, plain text. ${languageInstruction(language)}`
  );
}

export async function transcribeAudio({
  data,
  mimeType,
  language,
}: {
  data: string;
  mimeType: string;
  language?: string | null;
}): Promise<string> {
  return generateText(
    [{ role: "user", parts: [{ inlineData: { data, mimeType } }, { text: "Transcribe this audio." }] }],
    `You are a speech-to-text engine. Output only the verbatim transcription of the speech, without commentary. The speaker most likely uses this language: ${languageInstruction(language).replace("Respond in ", "")}`
  );
}
