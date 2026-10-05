"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme, hasStoredTheme } from "@/components/ThemeProvider";
import { isTheme } from "@/components/theme";
import { CREDITS_EVENT, getJson, type Me } from "@/components/account";
import { cx } from "@/components/ui";
import {
  ChartIcon,
  CameraIcon,
  ChatIcon,
  GearIcon,
  LogoutIcon,
  MapIcon,
  MoonIcon,
  SproutMark,
  SunIcon,
  ShieldIcon,
  UserIcon,
} from "@/components/icons";

const LINKS = [
  { href: "/chat", key: "chat", Icon: ChatIcon },
  { href: "/farms", key: "farms", Icon: MapIcon },
  { href: "/dashboard", key: "dashboard", Icon: ChartIcon },
  { href: "/scan", key: "scan", Icon: CameraIcon },
  { href: "/cases", key: "cases", Icon: ShieldIcon },
] as const;

function Avatar({ src, name, size }: { src?: string | null; name?: string | null; size: number }) {
  return src ? (
    <Image src={src} alt="" width={size} height={size} className="h-full w-full object-cover" />
  ) : (
    <span className="flex h-full w-full items-center justify-center bg-accent font-display font-semibold text-accent-fg">
      {name?.charAt(0).toUpperCase() || "U"}
    </span>
  );
}

export default function Navbar() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { theme, toggleTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;
    getJson<Me>("/api/me")
      .then((me) => {
        if (cancelled) return;
        setCredits(me.credits);
        // First visit on this device: adopt the theme saved on the account.
        if (!hasStoredTheme() && isTheme(me.theme)) setTheme(me.theme, { sync: false });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [status, setTheme]);

  useEffect(() => {
    function onCredits(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail === "number") setCredits(event.detail);
    }
    window.addEventListener(CREDITS_EVENT, onCredits);
    return () => window.removeEventListener(CREDITS_EVENT, onCredits);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const user = session?.user;
  const balance = credits ?? session?.credits ?? null;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className="sticky top-0 z-50 h-14 border-b border-border bg-surface/80 backdrop-blur-xl supports-[backdrop-filter]:bg-surface/70">
      <nav className="mx-auto flex h-full max-w-7xl items-center gap-2 px-3 sm:px-5">
        <Link
          href="/"
          aria-label={t("home")}
          className="group flex h-11 shrink-0 items-center gap-2 rounded-xl pr-2 text-fg"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-accent ring-1 ring-accent/30 transition-transform duration-300 group-hover:-rotate-6">
            <SproutMark width={18} height={18} strokeWidth={2} />
          </span>
          <span className="font-display text-[1.05rem] font-semibold">
            AgriLens<span className="text-accent"> AI</span>
          </span>
        </Link>

        {user && (
          <ul className="ml-4 hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, key, Icon }) => {
              const active = isActive(href);
              return (
                <li key={href} className="relative">
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "relative flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors",
                      active ? "text-fg" : "text-fg-subtle hover:text-fg"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 -z-10 rounded-lg bg-surface-3 ring-1 ring-border"
                        transition={{ type: "spring", stiffness: 420, damping: 34 }}
                      />
                    )}
                    <Icon width={16} height={16} className={active ? "text-accent" : undefined} />
                    {t(key)}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          {user && balance !== null && (
            <Link
              href="/profile"
              title={t("creditsLabel")}
              className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface-2 pl-2 pr-3 text-xs font-semibold text-fg transition-colors hover:border-accent/50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent-soft text-accent">
                <SproutMark width={13} height={13} strokeWidth={2.4} />
              </span>
              <span className="sr-only">{t("creditsLabel")}: </span>
              <span className="relative inline-flex overflow-hidden tabular-nums">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={balance}
                    initial={{ y: -12, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 12, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                  >
                    {new Intl.NumberFormat(locale).format(balance)}
                  </motion.span>
                </AnimatePresence>
              </span>
            </Link>
          )}

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("toDaylight") : t("toDark")}
            title={theme === "dark" ? t("toDaylight") : t("toDark")}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={theme}
                initial={{ rotate: -60, opacity: 0, scale: 0.6 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 60, opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.2 }}
              >
                {theme === "dark" ? <SunIcon /> : <MoonIcon />}
              </motion.span>
            </AnimatePresence>
          </button>

          {status === "loading" ? (
            <span className="h-9 w-9 animate-pulse rounded-full bg-surface-3" aria-hidden />
          ) : user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label={t("accountMenu")}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                className="flex h-11 w-11 items-center justify-center rounded-full"
              >
                <span
                  className={cx(
                    "block h-9 w-9 overflow-hidden rounded-full ring-2 transition-shadow",
                    menuOpen ? "ring-accent" : "ring-border hover:ring-border-strong"
                  )}
                >
                  <Avatar src={user.image} name={user.name} size={36} />
                </span>
              </button>

              <AnimatePresence>
                {menuOpen && (
                  <motion.div
                    role="menu"
                    initial={{ opacity: 0, y: -6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.16 }}
                    className="absolute right-0 mt-2 w-72 origin-top-right overflow-hidden rounded-2xl border border-border-strong bg-surface-2 shadow-raised"
                  >
                    <div className="flex items-center gap-3 border-b border-border p-4">
                      <span className="block h-11 w-11 shrink-0 overflow-hidden rounded-full ring-1 ring-border">
                        <Avatar src={user.image} name={user.name} size={44} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-fg">{user.name}</p>
                        <p className="truncate text-xs text-fg-subtle">{user.email}</p>
                      </div>
                    </div>
                    <div className="p-1.5">
                      {LINKS.map(({ href, key, Icon }) => (
                        <MenuLink key={href} href={href} onSelect={() => setMenuOpen(false)} className="md:hidden">
                          <Icon className="text-accent" />
                          {t(key)}
                        </MenuLink>
                      ))}
                      <MenuLink href="/profile" onSelect={() => setMenuOpen(false)}>
                        <UserIcon className="text-fg-subtle" />
                        {t("profile")}
                      </MenuLink>
                      <MenuLink href="/settings" onSelect={() => setMenuOpen(false)}>
                        <GearIcon className="text-fg-subtle" />
                        {t("settings")}
                      </MenuLink>
                      <div className="my-1.5 h-px bg-border" aria-hidden />
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          void signOut({ callbackUrl: "/" });
                        }}
                        className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium text-danger transition-colors hover:bg-danger/10"
                      >
                        <LogoutIcon />
                        {t("signOut")}
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => signIn("google")}
              className="flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-accent-fg transition hover:brightness-110 active:scale-[0.98]"
            >
              <span className="hidden sm:inline">{t("signInGoogle")}</span>
              <span className="sm:hidden">{t("signIn")}</span>
            </button>
          )}
        </div>
      </nav>
    </header>
  );
}

function MenuLink({
  href,
  onSelect,
  className,
  children,
}: {
  href: string;
  onSelect: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onSelect}
      className={cx(
        "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-3 hover:text-fg",
        className
      )}
    >
      {children}
    </Link>
  );
}
