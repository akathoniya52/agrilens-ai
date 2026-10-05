import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeCredits, refundCredits } from "@/lib/credits";
import { transcribeAudio } from "@/lib/gemini";
import { jsonError, serverError } from "@/lib/http";
import { isLanguageCode } from "@/lib/languages";
import { MAX_AUDIO_BYTES, baseMimeType } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return jsonError("Missing audio", 400);

    const mimeType = baseMimeType(audio.type);
    if (!mimeType.startsWith("audio/")) return jsonError("Unsupported audio type", 415);
    if (audio.size > MAX_AUDIO_BYTES) return jsonError("Audio must be 10MB or smaller", 413);

    const requested = form.get("language");
    const language = isLanguageCode(requested) ? requested : auth.user.language;

    const data = Buffer.from(await audio.arrayBuffer()).toString("base64");
    const credits = await consumeCredits(auth.user._id);
    if (credits === null) return jsonError("You have run out of credits.", 402);

    let text: string;
    try {
      text = await transcribeAudio({ data, mimeType, language });
    } catch (error) {
      await refundCredits(auth.user._id);
      throw error;
    }
    if (!text.trim()) {
      await refundCredits(auth.user._id);
      return NextResponse.json({ text: "", credits: credits + 1 });
    }
    return NextResponse.json({ text, credits });
  } catch (error) {
    return serverError("POST /api/transcribe", error);
  }
}
