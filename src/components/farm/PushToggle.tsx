"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { BellIcon } from "@/components/icons";
import { Switch } from "@/components/ui";

type PushState = "loading" | "unsupported" | "off" | "on";

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function pushContext() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return null;
  const [registration, config] = await Promise.all([
    navigator.serviceWorker.getRegistration(),
    fetch("/api/push/subscribe").then((r) => r.json() as Promise<{ enabled: boolean; publicKey: string | null }>),
  ]);
  if (!registration || !config.enabled || !config.publicKey) return null;
  return { registration, publicKey: config.publicKey };
}

export default function PushToggle() {
  const t = useTranslations("farms");
  const [state, setState] = useState<PushState>("loading");

  useEffect(() => {
    let cancelled = false;
    pushContext()
      .then(async (ctx) => {
        if (!ctx) return "unsupported" as const;
        const sub = await ctx.registration.pushManager.getSubscription();
        return sub ? ("on" as const) : ("off" as const);
      })
      .catch(() => "unsupported" as const)
      .then((next) => !cancelled && setState(next));
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(enable: boolean) {
    const ctx = await pushContext().catch(() => null);
    if (!ctx) return setState("unsupported");
    try {
      if (enable) {
        if ((await Notification.requestPermission()) !== "granted") {
          toast.error(t("push.denied"));
          return;
        }
        const sub = await ctx.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64ToBytes(ctx.publicKey),
        });
        const res = await fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON()),
        });
        if (!res.ok) throw new Error(String(res.status));
        setState("on");
      } else {
        const sub = await ctx.registration.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setState("off");
      }
    } catch {
      toast.error(t("push.failed"));
    }
  }

  if (state === "unsupported" || state === "loading") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-fg-muted">
      <BellIcon width={14} height={14} />
      {t("push.label")}
      <Switch checked={state === "on"} onChange={toggle} label={t("push.label")} />
    </span>
  );
}
