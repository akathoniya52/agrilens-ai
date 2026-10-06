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
// /api/transcribe accepts 4 MB; stop early enough that the final chunk can't push past it.
const MAX_AUDIO_BYTES = 4 * 1024 * 1024 - 256 * 1024;
const AUDIO_BITS_PER_SECOND = 32_000;
const CHUNK_MS = 250;
const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus", "audio/webm"];

interface Session {
  recorder: MediaRecorder;
  stream: MediaStream;
  audio: AudioContext;
  timer: number;
  /** Set when the component unmounts: the recording is thrown away instead of transcribed. */
  cancelled: boolean;
}

const stopTracks = (stream: MediaStream) => stream.getTracks().forEach((track) => track.stop());

function teardown(session: Session) {
  window.clearTimeout(session.timer);
  stopTracks(session.stream);
  void session.audio.close().catch(() => undefined);
}

function createRecorder(stream: MediaStream): MediaRecorder {
  const mimeType = MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
  try {
    return new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: AUDIO_BITS_PER_SECOND });
  } catch {
    return new MediaRecorder(stream);
  }
}

export function useVoiceRecorder({ language, onText }: { language: string; onText: (text: string) => void }) {
  const t = useTranslations("chat");
  const [state, setState] = useState<VoiceState>("idle");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const startingRef = useRef(false);
  // Bumped on unmount so a microphone permission that resolves afterwards stops its own stream.
  const tokenRef = useRef(0);

  useEffect(() => {
    const session = sessionRef;
    const token = tokenRef;
    return () => {
      token.current += 1;
      const current = session.current;
      session.current = null;
      if (!current) return;
      current.cancelled = true;
      if (current.recorder.state !== "inactive") current.recorder.stop();
      teardown(current);
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
    if (state !== "idle" || startingRef.current || sessionRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error(t("micUnsupported"));
      return;
    }

    startingRef.current = true;
    const token = tokenRef.current;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      if (token === tokenRef.current) toast.error(t("micDenied"));
      return;
    } finally {
      startingRef.current = false;
    }
    if (token !== tokenRef.current) {
      stopTracks(stream);
      return;
    }

    let recorder: MediaRecorder;
    let audio: AudioContext;
    let node: AnalyserNode;
    try {
      recorder = createRecorder(stream);
      audio = new AudioContext();
      node = audio.createAnalyser();
      node.fftSize = 512;
      node.smoothingTimeConstant = 0.7;
      audio.createMediaStreamSource(stream).connect(node);
    } catch (error) {
      console.error("Starting the voice recorder failed:", error);
      stopTracks(stream);
      toast.error(t("micUnsupported"));
      return;
    }

    const session: Session = { recorder, stream, audio, timer: window.setTimeout(stop, MAX_RECORDING_MS), cancelled: false };
    const chunks: Blob[] = [];
    let bytes = 0;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunks.push(event.data);
      bytes += event.data.size;
      if (bytes >= MAX_AUDIO_BYTES && recorder.state === "recording") recorder.stop();
    };
    recorder.onstop = () => {
      teardown(session);
      if (sessionRef.current === session) sessionRef.current = null;
      if (session.cancelled) return;
      setAnalyser(null);
      void transcribe(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    };

    recorder.start(CHUNK_MS);
    sessionRef.current = session;
    setAnalyser(node);
    setState("recording");
    haptic();
  }

  return { state, analyser, start, stop };
}
