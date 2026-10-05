"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { CREDITS_EVENT } from "@/components/account";
import { createChat, postMessage, uploadImage } from "@/components/chat/chat-api";
import DiagnosisCard from "@/components/chat/DiagnosisCard";
import Markdown from "@/components/chat/Markdown";
import { CameraIcon, WifiOffIcon } from "@/components/icons";
import { SproutLoader, cx } from "@/components/ui";
import { haptic } from "@/lib/haptics";
import { onDeviceEnabled, type OnDevicePrediction } from "@/lib/ondevice";
import type { OnDeviceClassifier } from "@/lib/ondevice/classifier";
import { readEventStream } from "@/lib/stream";
import type { Attachment, Diagnosis } from "@/types/chat";

const LIVE_INTERVAL_MS = 900;
const MAX_CAPTURE_PX = 1280;

type CameraState = "starting" | "live" | "denied" | "unsupported";

interface Shot {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

interface Analysis {
  phase: "uploading" | "thinking" | "streaming" | "done" | "error";
  text: string;
  diagnosis: Diagnosis | null;
  chatId: string | null;
  image: Attachment | null;
}

function captureFrame(video: HTMLVideoElement): Promise<Shot> {
  const scale = Math.min(1, MAX_CAPTURE_PX / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.round(video.videoWidth * scale);
  const height = Math.round(video.videoHeight * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(video, 0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve({ blob, url: URL.createObjectURL(blob), width, height }) : reject(new Error("Capture failed"))),
      "image/jpeg",
      0.86
    )
  );
}

export default function ScanCamera() {
  const t = useTranslations("scan");
  const videoRef = useRef<HTMLVideoElement>(null);
  const classifierRef = useRef<OnDeviceClassifier | null>(null);
  const [camera, setCamera] = useState<CameraState>("starting");
  const [live, setLive] = useState<OnDevicePrediction | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [shotPrediction, setShotPrediction] = useState<OnDevicePrediction | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const modelEnabled = onDeviceEnabled();

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    if (!navigator.mediaDevices?.getUserMedia) {
      queueMicrotask(() => setCamera("unsupported"));
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false })
      .then(async (media) => {
        if (cancelled) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        await video.play();
        setCamera("live");
      })
      .catch(() => !cancelled && setCamera("denied"));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (!modelEnabled || camera !== "live" || shot) return;
    let cancelled = false;
    let timer = 0;
    const tick = async () => {
      const video = videoRef.current;
      if (cancelled || !video || video.readyState < 2) return;
      if (!classifierRef.current) {
        const { loadOnDeviceClassifier } = await import("@/lib/ondevice/classifier");
        classifierRef.current = await loadOnDeviceClassifier();
      }
      const [top] = (await classifierRef.current?.classify(video, 1)) ?? [];
      if (!cancelled) setLive(top ?? null);
    };
    const loop = () => {
      void tick()
        .catch((error: unknown) => console.warn("AgriLens live scan failed:", error))
        .finally(() => {
          if (!cancelled) timer = window.setTimeout(loop, LIVE_INTERVAL_MS);
        });
    };
    loop();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [modelEnabled, camera, shot]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const url = shot?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [shot]);

  async function capture() {
    const video = videoRef.current;
    if (!video || camera !== "live") return;
    try {
      const next = await captureFrame(video);
      haptic(15);
      setShot(next);
      setShotPrediction(live);
      setAnalysis(null);
    } catch {
      toast.error(t("captureFailed"));
    }
  }

  function retake() {
    abortRef.current?.abort();
    setShot(null);
    setShotPrediction(null);
    setAnalysis(null);
  }

  async function analyze() {
    if (!shot) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalysis({ phase: "uploading", text: "", diagnosis: null, chatId: null, image: null });
    try {
      const uploaded = await uploadImage(shot.blob, "scan.jpg", controller.signal);
      const image: Attachment = { ...uploaded, width: shot.width, height: shot.height };
      const chat = await createChat();
      setAnalysis((a) => a && { ...a, phase: "thinking", chatId: chat._id, image });
      const note = shotPrediction ? `On-device model guess: ${shotPrediction.label} (${Math.round(shotPrediction.confidence * 100)}%).` : "";
      const res = await postMessage(chat._id, { content: note, attachments: [image] }, controller.signal);
      let text = "";
      await readEventStream(res, (event) => {
        if (event.type === "delta") {
          text += event.text;
          setAnalysis((a) => a && { ...a, phase: "streaming", text });
        } else if (event.type === "diagnosis") {
          setAnalysis((a) => a && { ...a, diagnosis: event.diagnosis });
        } else if (event.type === "done") {
          setAnalysis((a) => a && { ...a, phase: "done", text: event.assistantMsg.content });
          window.dispatchEvent(new CustomEvent(CREDITS_EVENT, { detail: event.credits }));
        } else if (event.type === "error") {
          toast.error(event.error);
          setAnalysis((a) => a && { ...a, phase: a.text ? "done" : "error" });
        }
      });
    } catch {
      if (!controller.signal.aborted) {
        toast.error(t("failed"));
        setAnalysis((a) => a && { ...a, phase: "error" });
      }
    }
  }

  const prediction = shot ? shotPrediction : live;
  const outlineTone = prediction ? (prediction.healthy ? "border-sev-none" : "border-sev-high") : "border-accent/70";
  const busy = analysis && (analysis.phase === "uploading" || analysis.phase === "thinking" || analysis.phase === "streaming");

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="relative aspect-[3/4] overflow-hidden rounded-3xl border border-border bg-black shadow-raised sm:aspect-[4/3]">
        <video ref={videoRef} playsInline muted className={cx("absolute inset-0 h-full w-full object-cover", shot && "invisible")} />
        {shot && <Image src={shot.url} alt={t("captured")} fill unoptimized className="object-cover" />}

        {camera === "live" && !shot && (
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 h-16 animate-[scan-sweep_2.6s_linear_infinite] bg-gradient-to-b from-transparent via-accent/35 to-transparent" />
          </div>
        )}
        {camera === "live" && (
          <div
            aria-hidden
            className={cx(
              "pointer-events-none absolute inset-[12%] rounded-[2rem] border-2 transition-colors",
              outlineTone,
              prediction && !prediction.healthy && "animate-pulse"
            )}
          />
        )}

        {prediction && (
          <div className="absolute inset-x-3 top-3 flex justify-center">
            <span className="max-w-full truncate rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
              {[prediction.crop, prediction.condition].filter(Boolean).join(" · ")} · {Math.round(prediction.confidence * 100)}%
            </span>
          </div>
        )}

        {(camera === "denied" || camera === "unsupported") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
            <CameraIcon width={32} height={32} />
            <p className="text-sm">
              {camera === "denied"
                ? t("denied")
                : t("unsupported")}
            </p>
            <Link href="/chat" className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold">
              {t("openChat")}
            </Link>
          </div>
        )}
        {camera === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <SproutLoader size={40} label={t("starting")} />
          </div>
        )}

        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-3">
          {shot ? (
            <>
              <button type="button" onClick={retake} className="min-h-11 rounded-2xl bg-black/60 px-5 text-sm font-semibold text-white backdrop-blur">
                {t("retake")}
              </button>
              <button
                type="button"
                onClick={analyze}
                disabled={Boolean(busy) || analysis?.phase === "done"}
                className="min-h-11 rounded-2xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-glow disabled:opacity-60"
              >
                {t("analyze")}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={capture}
              disabled={camera !== "live"}
              aria-label={t("capture")}
              className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white/80 bg-white/25 backdrop-blur transition active:scale-95 disabled:opacity-40"
            >
              <span className="h-11 w-11 rounded-full bg-white" />
            </button>
          )}
        </div>
      </div>

      <aside className="space-y-4">
        {!modelEnabled && (
          <p className="flex items-center gap-2 rounded-2xl border border-border bg-surface-2 p-4 text-sm text-fg-muted">
            <WifiOffIcon width={18} height={18} className="shrink-0 text-fg-subtle" />
            {t("noModel")}
          </p>
        )}
        {!analysis && (
          <p className="rounded-2xl border border-border bg-surface-2 p-4 text-sm text-fg-muted">
            {t("tip")}
          </p>
        )}
        {analysis && (
          <section className="rounded-3xl border border-border bg-surface-2 p-5 shadow-raised">
            {analysis.diagnosis && <DiagnosisCard diagnosis={analysis.diagnosis} image={analysis.image ?? undefined} />}
            {analysis.text ? (
              <Markdown content={analysis.text} streaming={analysis.phase === "streaming"} />
            ) : analysis.phase === "error" ? (
              <p className="text-sm text-danger">{t("failed")}</p>
            ) : (
              <SproutLoader size={34} label={analysis.phase === "uploading" ? t("uploading") : t("thinking")} />
            )}
            {analysis.chatId && analysis.phase === "done" && (
              <Link
                href={`/chat?c=${analysis.chatId}`}
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-border-strong px-4 text-sm font-semibold text-fg hover:bg-surface-3"
              >
                {t("continue")}
              </Link>
            )}
          </section>
        )}
      </aside>
    </div>
  );
}
