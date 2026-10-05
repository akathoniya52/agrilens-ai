"use client";

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "next-intl";
import Modal from "@/components/Modal";
import WhatsAppLink from "@/components/settings/WhatsAppLink";
import { useTheme } from "@/components/ThemeProvider";
import type { Theme } from "@/components/theme";
import { getJson, patchMe, type Me, type NotificationPrefs } from "@/components/account";
import { FadeIn, Panel, PanelRow, Skeleton, Switch, cx } from "@/components/ui";
import { BellIcon, CheckIcon, DownloadIcon, GlobeIcon, LogoutIcon, PaletteIcon, ShieldIcon, UserIcon } from "@/components/icons";
import { LANGUAGES, LOCALE_COOKIE, type LanguageCode } from "@/lib/languages";

const DEFAULT_PREFS: NotificationPrefs = { weatherAlerts: true, reminders: true };

const THEME_PREVIEW: Record<Theme, { bg: string; card: string; line: string; dot: string }> = {
  dark: { bg: "bg-soil-950", card: "bg-soil-800", line: "bg-soil-600", dot: "bg-leaf-400" },
  daylight: { bg: "bg-soil-50", card: "bg-white", line: "bg-soil-300", dot: "bg-leaf-900" },
};

export default function SettingsPage() {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const tn = useTranslations("nav");
  const { status } = useSession();
  const router = useRouter();
  const locale = useLocale();
  const { theme, setTheme } = useTheme();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [exporting, setExporting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingLocale, setPendingLocale] = useState<LanguageCode | null>(null);
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth/signin");
    if (status !== "authenticated") return;
    let cancelled = false;
    getJson<Me>("/api/me")
      .then((me) => {
        if (!cancelled && me.notificationPrefs) setPrefs({ ...DEFAULT_PREFS, ...me.notificationPrefs });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, router]);

  function changeTheme(next: Theme) {
    if (next === theme) return;
    setTheme(next);
    toast.success(t("saved"));
  }

  async function changeLanguage(code: LanguageCode) {
    if (code === locale) return;
    setPendingLocale(code);
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    try {
      await patchMe({ language: code });
    } catch {
      // The cookie already drives the UI; the account copy can sync next time.
      toast.error(t("saveFailed"));
    }
    startTransition(() => router.refresh());
    toast.success(t("language.changed"));
  }

  async function togglePref(key: keyof NotificationPrefs, value: boolean) {
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      await patchMe({ notificationPrefs: { [key]: value } });
      toast.success(t("saved"));
    } catch {
      setPrefs(previous);
      toast.error(t("saveFailed"));
    }
  }

  async function exportData() {
    setExporting(true);
    try {
      const chats = await getJson<{ _id: string }[]>("/api/chats");
      const data = await Promise.all(
        chats.map(async (chat) => ({ chat, messages: await getJson<unknown[]>(`/api/chats/${chat._id}/messages`) }))
      );
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `agrilens-data-${new Date().toISOString().split("T")[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t("data.exported"));
    } catch {
      toast.error(t("data.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:px-6" aria-busy="true">
        <span className="sr-only">{tc("loading")}</span>
        <Skeleton className="h-10 w-48" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44 rounded-3xl" />
        ))}
      </main>
    );
  }

  const activeLocale = isRefreshing && pendingLocale ? pendingLocale : locale;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <FadeIn className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl font-bold text-fg sm:text-5xl">{t("title")}</h1>
          <p className="mt-2 text-fg-muted">{t("subtitle")}</p>
        </div>
        <Link
          href="/profile"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-xl border border-border-strong px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-3"
        >
          <UserIcon width={16} height={16} />
          {tn("profile")}
        </Link>
      </FadeIn>

      <div className="space-y-5">
        <FadeIn delay={0.05}>
          <Panel title={t("appearance.title")} icon={<PaletteIcon width={18} height={18} />}>
            <div role="radiogroup" aria-label={t("appearance.theme")} className="grid gap-3 sm:grid-cols-2">
              {(["dark", "daylight"] as const).map((option) => {
                const selected = theme === option;
                const preview = THEME_PREVIEW[option];
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => changeTheme(option)}
                    className={cx(
                      "relative flex items-center gap-4 rounded-2xl border-2 p-3 text-left transition-colors",
                      selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
                    )}
                  >
                    <span aria-hidden className={cx("flex h-16 w-20 shrink-0 flex-col gap-1.5 rounded-xl border border-border p-2", preview.bg)}>
                      <span className={cx("flex items-center gap-1 rounded-md p-1.5", preview.card)}>
                        <span className={cx("h-2 w-2 rounded-full", preview.dot)} />
                        <span className={cx("h-1.5 flex-1 rounded-full", preview.line)} />
                      </span>
                      <span className={cx("h-1.5 w-3/4 rounded-full", preview.line)} />
                      <span className={cx("h-1.5 w-1/2 rounded-full", preview.line)} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-fg">{t(`appearance.${option}`)}</span>
                      <span className="mt-0.5 block text-sm text-fg-subtle">{t(`appearance.${option}Hint`)}</span>
                    </span>
                    {selected && (
                      <motion.span
                        layoutId="theme-check"
                        className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg"
                      >
                        <CheckIcon width={14} height={14} strokeWidth={3} />
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>
          </Panel>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Panel title={t("language.title")} icon={<GlobeIcon width={18} height={18} />}>
            <p className="-mt-2 mb-4 text-sm text-fg-subtle">{t("language.hint")}</p>
            <div role="radiogroup" aria-label={t("language.title")} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {LANGUAGES.map((lang) => {
                const selected = activeLocale === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={isRefreshing}
                    onClick={() => changeLanguage(lang.code)}
                    className={cx(
                      "flex min-h-14 flex-col items-start justify-center rounded-xl border-2 px-3 py-2 text-left transition-colors disabled:cursor-wait",
                      selected ? "border-accent bg-accent-soft" : "border-border bg-surface hover:border-border-strong"
                    )}
                  >
                    <span lang={lang.code} className="font-semibold text-fg">
                      {lang.nativeLabel}
                    </span>
                    <span className="text-xs text-fg-subtle">{lang.label}</span>
                  </button>
                );
              })}
            </div>
          </Panel>
        </FadeIn>

        <FadeIn delay={0.15}>
          <Panel title={t("notifications.title")} icon={<BellIcon width={18} height={18} />}>
            <div className="space-y-3">
              {(["weatherAlerts", "reminders"] as const).map((key) => (
                <PanelRow key={key} id={key} title={t(`notifications.${key}`)} hint={t(`notifications.${key}Hint`)}>
                  <Switch
                    checked={prefs[key]}
                    onChange={(value) => togglePref(key, value)}
                    labelledBy={`${key}-label`}
                    describedBy={`${key}-hint`}
                    className="self-end sm:self-auto"
                  />
                </PanelRow>
              ))}
            </div>
          </Panel>
        </FadeIn>

        <FadeIn delay={0.18}>
          <WhatsAppLink />
        </FadeIn>

        <FadeIn delay={0.2}>
          <Panel title={t("data.title")} icon={<ShieldIcon width={18} height={18} />}>
            <PanelRow title={t("data.export")} hint={t("data.exportHint")}>
              <button
                type="button"
                onClick={exportData}
                disabled={exporting}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border-strong bg-surface-2 px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-3 disabled:cursor-wait disabled:opacity-60"
              >
                <DownloadIcon width={16} height={16} />
                {exporting ? t("data.exporting") : t("data.exportButton")}
              </button>
            </PanelRow>
          </Panel>
        </FadeIn>

        <FadeIn delay={0.25}>
          <Panel title={t("account.title")} tone="danger" icon={<LogoutIcon width={18} height={18} />}>
            <div className="space-y-3">
              <PanelRow title={t("account.signOut")} hint={t("account.signOutHint")}>
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-strong px-4 text-sm font-semibold text-fg transition-colors hover:bg-surface-3"
                >
                  {t("account.signOut")}
                </button>
              </PanelRow>
              <PanelRow title={t("account.delete")} hint={t("account.deleteHint")}>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-danger px-4 text-sm font-semibold text-surface transition hover:brightness-110"
                >
                  {t("account.delete")}
                </button>
              </PanelRow>
            </div>
          </Panel>
        </FadeIn>
      </div>

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => toast.info(t("account.deleteUnavailable"))}
        title={t("account.deleteConfirmTitle")}
        message={t("account.deleteConfirmMessage")}
        type="confirm"
        confirmText={t("account.deleteConfirm")}
        cancelText={tc("cancel")}
      />
    </main>
  );
}
