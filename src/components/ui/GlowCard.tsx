"use client";

import { useRef, type HTMLAttributes, type PointerEvent } from "react";
import { cx } from "./cx";

interface GlowCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Glow radius in px. */
  radius?: number;
}

/**
 * Card with a soft radial glow that follows the mouse. Position is written to
 * CSS variables directly, so moving the pointer never re-renders React.
 * Touch devices get the static card.
 */
export default function GlowCard({ radius = 360, className, children, onPointerMove, ...rest }: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    onPointerMove?.(event);
    const el = ref.current;
    if (!el || event.pointerType !== "mouse") return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--gx", `${event.clientX - rect.left}px`);
    el.style.setProperty("--gy", `${event.clientY - rect.top}px`);
  }

  return (
    <div
      ref={ref}
      onPointerMove={handlePointerMove}
      className={cx(
        "group/glow relative isolate overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-raised transition-colors duration-300 hover:border-border-strong",
        className
      )}
      {...rest}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-500 group-hover/glow:opacity-100"
        style={{
          background: `radial-gradient(${radius}px circle at var(--gx, 50%) var(--gy, 0%), var(--color-glow), transparent 60%)`,
        }}
      />
      {children}
    </div>
  );
}
