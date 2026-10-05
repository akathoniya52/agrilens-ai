import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { consumeCredits, refundCredits } from "@/lib/credits";
import { transcribeAudio } from "@/lib/gemini";
import { exceedsContentLength, jsonError, serverError } from "@/lib/http";
import { isLanguageCode } from "@/lib/languages";
import { MAX_AUDIO_BYTES, baseMimeType, looksLikeAudio } from "@/lib/media";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUser();
    if ("error" in auth) return auth.error;
    if (exceedsContentLength(req, MAX_AUDIO_BYTES + 64 * 1024)) return jsonError("Audio must be 10MB or smaller", 413);
    const limited = await rateLimit("transcribe", auth.user._id.toString(), RATE_LIMITS.transcribe);
    if (limited) return limited;

    const form = await req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof File)) return jsonError("Missing audio", 400);

    const mimeType = baseMimeType(audio.type);
    if (!mimeType.startsWith("audio/")) return jsonError("Unsupported audio type", 415);
    if (audio.size > MAX_AUDIO_BYTES) return jsonError("Audio must be 10MB or smaller", 413);

    const requested = form.get("language");
    const language = isLanguageCode(requested) ? requested : auth.user.language;

    const bytes = Buffer.from(await audio.arrayBuffer());
    if (!looksLikeAudio(bytes)) return jsonError("Unsupported audio type", 415);
    const data = bytes.toString("base64");
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
