"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ConfidenceRing, SeverityMeter, cx } from "@/components/ui";

interface Box {
  label: string;
  /** Normalized 0–1, top-left origin. */
  x: number;
  y: number;
  w: number;
  h: number;
  tone: "blight" | "harvest" | "leaf";
  align?: "left" | "right";
}

interface ScanHeroProps {
  alt: string;
  labels: { live: string; analyzing: string; done: string; box1: string; box2: string; box3: string; confidence: string };
}

// Box colours are fixed (not theme tokens): they sit on a photo, which looks the same in both themes.
const TONE = {
  blight: { border: "border-blight", chip: "bg-blight text-white" },
  harvest: { border: "border-harvest", chip: "bg-harvest text-soil-950" },
  leaf: { border: "border-leaf-300", chip: "bg-leaf-300 text-soil-950" },
} as const;

const SWEEP_SECONDS = 2.4;
const HOLD_MS = 6000;

export default function ScanHero({ alt, labels }: ScanHeroProps) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"scanning" | "done">("scanning");
  const [cycle, setCycle] = useState(0);
  const done = reduce || phase === "done";

  useEffect(() => {
    if (reduce || phase !== "done") return;
    const id = window.setTimeout(() => {
      setPhase("scanning");
      setCycle((c) => c + 1);
    }, HOLD_MS);
    return () => window.clearTimeout(id);
  }, [phase, reduce]);

  const boxes: Box[] = [
    { label: labels.box1, x: 0.44, y: 0.8, w: 0.15, h: 0.17, tone: "blight" },
    { label: labels.box2, x: 0.76, y: 0.5, w: 0.15, h: 0.15, tone: "harvest", align: "right" },
    { label: labels.box3, x: 0.86, y: 0.72, w: 0.12, h: 0.2, tone: "leaf", align: "right" },
  ];

  return (
    <div className="relative">
      <div className="relative aspect-[11/6] overflow-hidden rounded-3xl border border-border-strong bg-surface-3 shadow-raised">
        <Image
          src="/landing_pic.png"
          alt={alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-soil-950/55 via-transparent to-soil-950/10" />

        {/* Viewfinder corners */}
        <div aria-hidden className="pointer-events-none absolute inset-3 sm:inset-4">
          {["left-0 top-0 border-l-2 border-t-2 rounded-tl-lg", "right-0 top-0 border-r-2 border-t-2 rounded-tr-lg", "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg", "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg"].map((c) => (
            <span key={c} className={cx("absolute h-5 w-5 border-leaf-300/90 sm:h-7 sm:w-7", c)} />
          ))}
        </div>

        {/* Status chip */}
        <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-soil-950/75 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-soil-100 backdrop-blur sm:left-6 sm:top-6 sm:text-xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 animate-ping rounded-full bg-leaf-400 opacity-70" />
            <span className="relative h-2 w-2 rounded-full bg-leaf-400" />
          </span>
          <span className="sr-only">{labels.live}: </span>
          <span aria-live="polite">{done ? labels.done : labels.analyzing}</span>
        </div>

        {/* Sweep */}
        {!reduce && phase === "scanning" && (
          <motion.div
            key={cycle}
            aria-hidden
            className="pointer-events-none absolute inset-0"
            initial={{ y: "-100%" }}
            animate={{ y: "0%" }}
            transition={{ duration: SWEEP_SECONDS, ease: [0.45, 0, 0.55, 1], delay: cycle === 0 ? 0.6 : 0 }}
            onAnimationComplete={() => setPhase("done")}
          >
            <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-leaf-400/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-0.5 bg-leaf-300 shadow-[0_0_18px_4px_rgb(74_222_128/0.75)]" />
          </motion.div>
        )}

        {/* Detections */}
        <AnimatePresence>
          {done &&
            boxes.map((box, i) => (
              <motion.div
                key={`${cycle}-${box.label}`}
                className={cx("absolute rounded-md border-2", TONE[box.tone].border)}
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
                initial={{ opacity: 0, scale: 1.25 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.45, delay: reduce ? 0 : i * 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <span
                  className={cx(
                    "absolute bottom-full mb-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-bold shadow-lg sm:px-2 sm:text-xs",
                    box.align === "right" ? "right-0" : "left-0",
                    TONE[box.tone].chip
                  )}
                >
                  {box.label}
                </span>
              </motion.div>
            ))}
        </AnimatePresence>
      </div>

      {/* Floating readout, breaks out of the frame */}
      <AnimatePresence>
        {done && (
          <motion.div
            key={`readout-${cycle}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.5, delay: reduce ? 0 : 0.6 }}
            className="absolute -bottom-8 left-4 hidden items-center gap-3 rounded-2xl border border-border-strong bg-surface-2/90 p-3 pr-4 shadow-raised backdrop-blur-xl sm:flex lg:-left-8"
          >
            <ConfidenceRing value={0.92} size={48} strokeWidth={4} label={labels.confidence} />
            <div className="space-y-1.5">
              <p className="font-display text-sm font-semibold text-fg">{labels.box1.split("·")[0].trim()}</p>
              <SeverityMeter severity="moderate" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
