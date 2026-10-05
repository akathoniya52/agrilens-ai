"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "next-intl";
import { getJson, patchMe, type Me } from "@/components/account";
import { ChatIcon } from "@/components/icons";
import { Panel, PanelRow } from "@/components/ui";

interface Pending {
  phone: string;
  expiresAt: string;
  code: string | null;
}

interface LinkState {
  linked: string | null;
  pending: Pending | null;
}

function fromMe(me: Me, code: string | null = null): LinkState {
  const pending =
    me.pendingPhone && me.pendingPhoneExpiresAt
      ? { phone: me.pendingPhone, expiresAt: me.pendingPhoneExpiresAt, code: me.phoneCode ?? code }
      : null;
  return { linked: me.phone ?? null, pending };
}

export default function WhatsAppLink() {
  const t = useTranslations("settings");
  const format = useFormatter();
  const [state, setState] = useState<LinkState | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getJson<Me>("/api/me")
      .then((me) => !cancelled && setState(fromMe(me)))
      .catch(() => !cancelled && setState({ linked: null, pending: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(phone: string | null) {
    setBusy(true);
    try {
      const me = await patchMe({ phone });
      setState(fromMe(me));
      setDraft("");
      if (!phone) toast.success(t("whatsapp.unlinked"));
    } catch (error) {
      const taken = error instanceof Error && error.message.endsWith("409");
      toast.error(taken ? t("whatsapp.taken") : t("whatsapp.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    setBusy(true);
    try {
      const me = await getJson<Me>("/api/me");
      setState((prev) => fromMe(me, prev?.pending?.phone === me.pendingPhone ? prev?.pending?.code ?? null : null));
      if (me.phone) toast.success(t("whatsapp.linked"));
      else toast.info(t("whatsapp.notYet"));
    } catch {
      toast.error(t("whatsapp.failed"));
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.trim()) void save(draft.trim());
  }

  const linked = state?.linked ?? null;
  const pending = state?.pending ?? null;
  const title = linked
    ? t("whatsapp.current", { phone: `+${linked}` })
    : pending
      ? t("whatsapp.pending", { phone: `+${pending.phone}` })
      : t("whatsapp.link");

  return (
    <Panel title={t("whatsapp.title")} icon={<ChatIcon width={18} height={18} />}>
      <PanelRow id="whatsapp" title={title} hint={t("whatsapp.hint")}>
        {linked ? (
          <button type="button" disabled={busy} onClick={() => save(null)} className="min-h-11 rounded-xl px-4 text-sm font-semibold text-danger hover:bg-danger/10 disabled:opacity-60">
            {t("whatsapp.remove")}
          </button>
        ) : (
          <form onSubmit={submit} className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="+91 98765 43210"
              aria-label={t("whatsapp.number")}
              className="min-h-11 w-44 rounded-xl border border-border bg-surface px-3 text-sm text-fg"
            />
            <button type="submit" disabled={busy || state === undefined || !draft.trim()} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60">
              {pending ? t("whatsapp.resend") : t("whatsapp.save")}
            </button>
          </form>
        )}
      </PanelRow>
      {!linked && pending && (
        <div className="mt-3 space-y-2 rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-fg-muted" role="status">
          {pending.code ? (
            <p>
              {t("whatsapp.sendCode")}{" "}
              <span className="font-mono text-base font-bold tracking-widest text-fg">{pending.code}</span>
            </p>
          ) : (
            <p>{t("whatsapp.codeHidden")}</p>
          )}
          <p className="text-xs text-fg-subtle">
            {t("whatsapp.expires", { time: format.dateTime(new Date(pending.expiresAt), { hour: "numeric", minute: "2-digit" }) })}
          </p>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={check} className="min-h-10 rounded-xl border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-surface-3 disabled:opacity-60">
              {t("whatsapp.check")}
            </button>
            <button type="button" disabled={busy} onClick={() => save(null)} className="min-h-10 rounded-xl px-3 text-xs font-semibold text-danger hover:bg-danger/10 disabled:opacity-60">
              {t("whatsapp.cancel")}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
