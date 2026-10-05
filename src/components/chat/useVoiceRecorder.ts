"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CREDITS_EVENT } from "@/components/account";
import { haptic } from "@/lib/haptics";
import { ApiError, transcribeAudio } from "./chat-api";

export type VoiceState = "idle" | "recording" | "transcribing";

const MAX_RECORDING_MS = 60_000;
const MIN_AUDIO_BYTES = 1_000;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

interface Session {
  recorder: MediaRecorder;
  stream: MediaStream;
  audio: AudioContext;
  timer: number;
}

function teardown(session: Session) {
  window.clearTimeout(session.timer);
  session.stream.getTracks().forEach((track) => track.stop());
  void session.audio.close().catch(() => undefined);
}

export function useVoiceRecorder({ language, onText }: { language: string; onText: (text: string) => void }) {
  const t = useTranslations("chat");
  const [state, setState] = useState<VoiceState>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const sessionRef = useRef<Session | null>(null);

  useEffect(() => {
    const ref = sessionRef;
    return () => {
      if (ref.current) teardown(ref.current);
    };
  }, []);

  async function transcribe(blob: Blob) {
    if (blob.size < MIN_AUDIO_BYTES) {
      setState("idle");
      return;
    }
    setState("transcribing");
    try {
      const { text, credits } = await transcribeAudio(blob, language);
      window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: credits }));
      if (text.trim()) onText(text.trim());
      else toast.error(t("transcribeFailed"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 402) {
        toast.error(t("outOfCredits"), { description: t("outOfCreditsBody") });
      } else {
        toast.error(t("transcribeFailed"));
      }
    } finally {
      setState("idle");
    }
  }

  function stop() {
    const recorder = sessionRef.current?.recorder;
    if (recorder && recorder.state !== "inactive") recorder.stop();
  }

  async function start() {
    if (state !== "idle") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error(t("micUnsupported"));
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      toast.error(t("micDenied"));
      return;
    }

    const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const audio = new AudioContext();
    const node = audio.createAnalyser();
    node.fftSize = 512;
    node.smoothingTimeConstant = 0.7;
    audio.createMediaStreamSource(stream).connect(node);

    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" });
      if (sessionRef.current) teardown(sessionRef.current);
      sessionRef.current = null;
      setAnalyser(null);
      void transcribe(blob);
    };

    recorder.start(250);
    sessionRef.current = { recorder, stream, audio, timer: window.setTimeout(stop, MAX_RECORDING_MS) };
    setAnalyser(node);
    setState("recording");
    haptic();
  }

  return { state, analyser, start, stop };
}
