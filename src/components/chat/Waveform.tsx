"use client";

import { useEffect, useRef } from "react";
import { cx } from "@/components/ui";

const BAR_COUNT = 36;
const BAR_GAP = 3;

/** Live mirrored bar waveform drawn from an AnalyserNode. Colour follows `currentColor`. */
export default function Waveform({ analyser, className }: { analyser: AnalyserNode | null; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !analyser) return;

    const data = new Uint8Array(analyser.frequencyBinCount);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = getComputedStyle(canvas).color;

      analyser.getByteFrequencyData(data);
      const barWidth = (w - BAR_GAP * (BAR_COUNT - 1)) / BAR_COUNT;
      const usable = Math.floor(data.length * 0.6);
      for (let i = 0; i < BAR_COUNT; i++) {
        const mirrored = Math.abs(i - (BAR_COUNT - 1) / 2) / (BAR_COUNT / 2);
        const level = data[Math.floor(mirrored * usable)] / 255;
        const barHeight = Math.max(3, level * h * 0.95);
        ctx.globalAlpha = 0.45 + level * 0.55;
        ctx.beginPath();
        ctx.roundRect(i * (barWidth + BAR_GAP), (h - barHeight) / 2, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }
      if (!reduce) frame = requestAnimationFrame(draw);
    };

    draw();
    const interval = reduce ? window.setInterval(draw, 200) : 0;
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(interval);
    };
  }, [analyser]);

  return <canvas ref={canvasRef} aria-hidden className={cx("block h-8 w-full text-accent", className)} />;
}
