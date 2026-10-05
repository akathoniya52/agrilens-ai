"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { OUTBOX_EVENT, flushOutbox, outboxSupported, type FlushResult } from "@/lib/outbox";

const DEV_FLAG = "agrilens-sw-dev";

function swAllowed() {
  return "serviceWorker" in navigator && (process.env.NODE_ENV === "production" || localStorage.getItem(DEV_FLAG) === "1");
}

function clearUserCache() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.controller?.postMessage({ type: "clear-user-cache" });
}

/** Registers /sw.js, flushes the offline outbox when online and clears per-user caches on sign-out or account switch. */
export default function PwaRegister() {
  const t = useTranslations("chat");
  const tRef = useRef(t);
  const { status, data: session } = useSession();
  const userId = status === "authenticated" ? session?.userId ?? null : null;
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    if (!swAllowed()) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error: unknown) => {
      console.error("Service worker registration failed:", error);
    });
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    const previous = previousUserId.current;
    if (status === "unauthenticated" || (previous && previous !== userId)) clearUserCache();
    previousUserId.current = userId;
  }, [status, userId]);

  useEffect(() => {
    if (!userId || !outboxSupported()) return;

    const onOutbox = (event: Event) => {
      const { blockedStatus } = (event as CustomEvent<FlushResult>).detail;
      if (blockedStatus === 402) {
        toast.error(tRef.current("outOfCredits"), { description: tRef.current("queuedNoCredits") });
      } else if (blockedStatus !== null) {
        toast.error(tRef.current("queuedRetry"));
      }
    };
    const flush = () => {
      flushOutbox()
        .then(({ sent }) => {
          if (sent > 0) toast.success(tRef.current("queuedSent", { count: sent }));
        })
        .catch((error: unknown) => console.error("Outbox flush failed:", error));
    };
    window.addEventListener(OUTBOX_EVENT, onOutbox);
    if (navigator.onLine) flush();
    window.addEventListener("online", flush);
    return () => {
      window.removeEventListener(OUTBOX_EVENT, onOutbox);
      window.removeEventListener("online", flush);
    };
  }, [userId]);

  return null;
}
