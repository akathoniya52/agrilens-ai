"use client";

import { useEffect, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cx } from "@/components/ui";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  title: string;
  message: string;
  type?: "info" | "success" | "warning" | "error" | "confirm";
  confirmText?: string;
  cancelText?: string;
}

const ICONS: Record<NonNullable<ModalProps["type"]>, { tone: string; path: ReactNode }> = {
  success: { tone: "text-success bg-success/12", path: <path d="M20 6 9 17l-5-5" /> },
  error: { tone: "text-danger bg-danger/12", path: <path d="M18 6 6 18M6 6l12 12" /> },
  warning: { tone: "text-warning bg-warning/12", path: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /> },
  confirm: { tone: "text-danger bg-danger/12", path: <path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /> },
  info: { tone: "text-info bg-info/12", path: <path d="M12 16v-4m0-4h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0z" /> },
};

/** Blocking dialog. Reserve for destructive confirmations; use toasts for feedback. */
export default function Modal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = "info",
  confirmText = "OK",
  cancelText = "Cancel",
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, onClose]);

  const icon = ICONS[type];
  const destructive = type === "confirm" || type === "error";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-end justify-center p-4 sm:items-center">
          <motion.div
            className="absolute inset-0 bg-soil-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-message"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 34 }}
            className="relative w-full max-w-md space-y-4 rounded-3xl border border-border-strong bg-surface-2 p-6 text-center shadow-raised"
          >
            <span className={cx("mx-auto flex h-12 w-12 items-center justify-center rounded-full", icon.tone)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {icon.path}
              </svg>
            </span>
            <h3 id="modal-title" className="font-display text-xl font-semibold text-fg">
              {title}
            </h3>
            <p id="modal-message" className="text-fg-muted">
              {message}
            </p>
            <div className="flex gap-3 pt-2">
              {type === "confirm" && (
                <button
                  type="button"
                  autoFocus
                  onClick={onClose}
                  className="min-h-12 flex-1 rounded-xl border border-border-strong font-semibold text-fg transition-colors hover:bg-surface-3"
                >
                  {cancelText}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  onConfirm?.();
                  onClose();
                }}
                className={cx(
                  "min-h-12 flex-1 rounded-xl font-semibold transition hover:brightness-110",
                  destructive ? "bg-danger text-surface" : "bg-accent text-accent-fg"
                )}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
