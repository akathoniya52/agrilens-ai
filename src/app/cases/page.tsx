"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import Markdown from "@/components/chat/Markdown";
import { ShieldIcon, UserIcon } from "@/components/icons";
import { casesApi } from "@/components/insights/api";
import { FadeIn, Skeleton, cx } from "@/components/ui";
import type { CaseDTO, CaseStatus } from "@/types/insights";
import { signInUrlForCurrentPage } from "@/lib/client/sign-in";

const STATUS_TONE: Record<CaseStatus, string> = {
  open: "border-warning/40 bg-warning/10 text-warning",
  assigned: "border-info/40 bg-info/10 text-info",
  resolved: "border-success/40 bg-success/10 text-success",
};

function CaseCard({ item, expert, onChange }: { item: CaseDTO; expert: boolean; onChange: (next: CaseDTO) => void }) {
  const t = useTranslations("cases");
  const format = useFormatter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  async function update(patch: { status?: CaseStatus; note?: string; assignToMe?: boolean }) {
    setBusy(true);
    try {
      onChange(await casesApi.update(item._id, patch));
      if (patch.note) setNote("");
    } catch {
      toast.error(t("updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-3xl border border-border bg-surface-2 p-5 shadow-raised">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-fg">
            {item.diagnosis ? `${item.diagnosis.crop} · ${item.diagnosis.condition}` : item.question || t("untitled")}
          </p>
          <p className="text-xs text-fg-subtle">
            {format.dateTime(new Date(item.createdAt), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            {item.owner && ` · ${item.owner.name ?? item.owner.email}`}
            {item.assignedTo && ` · ${t("assignedTo", { email: item.assignedTo })}`}
          </p>
        </div>
        <span className={cx("rounded-full border px-2.5 py-1 text-xs font-semibold", STATUS_TONE[item.status])}>
          {t(`status.${item.status}`)}
        </span>
      </div>

      {item.question && <p className="mt-3 whitespace-pre-wrap text-sm text-fg">{item.question}</p>}
      {item.imageUrls.length > 0 && (
        <div className="mt-3 flex gap-2">
          {item.imageUrls.slice(0, 4).map((url, i) => (
            <Image key={`${i}-${url.slice(-16)}`} src={url} alt={t("photo", { index: i + 1 })} width={96} height={96} unoptimized className="h-20 w-20 rounded-xl border border-border object-cover" />
          ))}
        </div>
      )}

      <button type="button" onClick={() => setOpen((v) => !v)} className="mt-3 text-xs font-semibold text-accent hover:underline">
        {open ? t("hideAnswer") : t("showAnswer")}
      </button>
      {open && (
        <div className="mt-2 rounded-2xl border border-border bg-surface p-4">
          <Markdown content={item.answer} streaming={false} />
        </div>
      )}

      {item.notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {item.notes.map((n, i) => (
            <li key={`${n.at}-${i}`} className={cx("rounded-2xl px-3 py-2 text-sm", n.role === "expert" ? "border border-accent/30 bg-accent-soft text-fg" : "bg-surface-3 text-fg")}>
              <p className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-fg-subtle">
                {n.role === "expert" ? <ShieldIcon width={12} height={12} /> : <UserIcon width={12} height={12} />}
                {n.author} · {format.dateTime(new Date(n.at), { day: "numeric", month: "short" })}
              </p>
              <p className="whitespace-pre-wrap">{n.text}</p>
            </li>
          ))}
        </ul>
      )}

      {item.status !== "resolved" && (
        <form
          className="mt-4 flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) void update({ note: note.trim() });
          }}
        >
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={expert ? t("expertNote") : t("farmerNote")}
            aria-label={t("addNote")}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-surface px-3 text-sm text-fg"
          />
          <button type="submit" disabled={busy || !note.trim()} className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-60">
            {t("send")}
          </button>
        </form>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Link href={`/chat?c=${item.chatId}`} className="inline-flex min-h-9 items-center rounded-xl border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-surface-3">
          {t("openChat")}
        </Link>
        {expert && item.status === "open" && (
          <button type="button" disabled={busy} onClick={() => update({ assignToMe: true })} className="inline-flex min-h-9 items-center rounded-xl border border-border-strong px-3 text-xs font-semibold text-fg hover:bg-surface-3 disabled:opacity-60">
            {t("assignToMe")}
          </button>
        )}
        {item.status !== "resolved" ? (
          <button type="button" disabled={busy} onClick={() => update({ status: "resolved" })} className="inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-semibold text-success hover:bg-success/10 disabled:opacity-60">
            {t("resolve")}
          </button>
        ) : (
          expert && (
            <button type="button" disabled={busy} onClick={() => update({ status: "open" })} className="inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-semibold text-fg-muted hover:bg-surface-3 disabled:opacity-60">
              {t("reopen")}
            </button>
          )
        )}
      </div>
    </li>
  );
}

export default function CasesPage() {
  const t = useTranslations("cases");
  const { status } = useSession();
  const router = useRouter();
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [state, setState] = useState<{ scope: string; expert: boolean; cases: CaseDTO[] } | null>(null);
  const loadFailed = t("loadFailed");

  useEffect(() => {
    if (status === "unauthenticated") router.replace(signInUrlForCurrentPage());
    if (status !== "authenticated") return;
    let cancelled = false;
    casesApi
      .list(scope)
      .then((res) => !cancelled && setState({ scope, ...res }))
      .catch(() => {
        if (cancelled) return;
        toast.error(loadFailed);
        setState({ scope, expert: false, cases: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [status, router, scope, loadFailed]);

  const current = state?.scope === scope ? state : null;
  const replace = (next: CaseDTO) =>
    setState((s) => s && { ...s, cases: s.cases.map((c) => (c._id === next._id ? { ...next, owner: c.owner } : c)) });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <FadeIn className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-fg sm:text-4xl">{t("title")}</h1>
          <p className="mt-1 text-fg-muted">{t("subtitle")}</p>
        </div>
        {state?.expert && (
          <div className="flex gap-1 rounded-xl border border-border p-1">
            {(["mine", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setScope(s)}
                aria-pressed={scope === s}
                className={cx("min-h-9 rounded-lg px-3 text-xs font-semibold", scope === s ? "bg-accent text-accent-fg" : "text-fg-muted hover:bg-surface-3")}
              >
                {s === "all" ? t("allCases") : t("myCases")}
              </button>
            ))}
          </div>
        )}
      </FadeIn>

      {!current ? (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-40 rounded-3xl" />
          ))}
        </div>
      ) : current.cases.length === 0 ? (
        <p className="rounded-3xl border border-border bg-surface-2 p-8 text-center text-sm text-fg-muted">
          {t("empty")}
        </p>
      ) : (
        <ul className="space-y-4">
          {current.cases.map((item) => (
            <CaseCard key={item._id} item={item} expert={current.expert} onChange={replace} />
          ))}
        </ul>
      )}
    </main>
  );
}
