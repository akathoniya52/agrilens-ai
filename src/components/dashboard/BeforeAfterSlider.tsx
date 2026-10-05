"use client";

import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "@/components/ui";

interface BeforeAfterSliderProps {
  before: { src: string; label: string };
  after: { src: string; label: string };
  className?: string;
}

/** Drag/keyboard comparison of two photos; `<img>` is used because sources may be blob URLs or data URLs. */
export default function BeforeAfterSlider({ before, after, className }: BeforeAfterSliderProps) {
  const [pos, setPos] = useState(50);
  const [dragging, setDragging] = useState(false);
  const id = useId();

  function track(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setPos(Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100)));
  }

  function onKey(event: KeyboardEvent) {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === "ArrowLeft") setPos((p) => Math.max(0, p - step));
    else if (event.key === "ArrowRight") setPos((p) => Math.min(100, p + step));
    else return;
    event.preventDefault();
  }

  return (
    <div
      className={cx("relative aspect-[4/3] touch-none select-none overflow-hidden rounded-2xl border border-border bg-surface-3", className)}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
        track(e);
      }}
      onPointerMove={(e) => dragging && track(e)}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary blob/data URLs */}
      <img src={after.src} alt={after.label} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary blob/data URLs */}
        <img src={before.src} alt={before.label} className="h-full w-full object-cover" draggable={false} />
      </div>
      <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">{before.label}</span>
      <span className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">{after.label}</span>
      <div className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_16px_rgba(0,0,0,0.6)]" style={{ left: `${pos}%` }}>
        <div
          role="slider"
          tabIndex={0}
          id={id}
          aria-label={`${before.label} / ${after.label}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pos)}
          onKeyDown={onKey}
          className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border-2 border-white bg-black/50 text-white backdrop-blur"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="m9 6-6 6 6 6M15 6l6 6-6 6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
