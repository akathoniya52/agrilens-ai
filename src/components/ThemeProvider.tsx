"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { THEME_STORAGE_KEY, type Theme } from "@/components/theme";

export type { Theme };

interface SetThemeOptions {
  /** Persist to the user's account. Defaults to true when signed in. */
  sync?: boolean;
}

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme, options?: SetThemeOptions) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// The <html data-theme> attribute is the source of truth; React subscribes to it.
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "daylight" ? "daylight" : "dark";
}

function getServerSnapshot(): Theme {
  return "dark";
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback(
    (next: Theme, options?: SetThemeOptions) => {
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Storage can be unavailable (private mode); the attribute still applies.
      }
      const sync = options?.sync ?? true;
      if (sync && status === "authenticated") {
        void fetch("/api/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ theme: next }),
        }).catch(() => undefined);
      }
    },
    [status]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme,
      toggleTheme: () => setTheme(theme === "dark" ? "daylight" : "dark"),
    }),
    [theme, setTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}

/** True when the visitor has never chosen a theme on this device. */
export function hasStoredTheme() {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}
