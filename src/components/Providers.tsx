"use client";

import type { CSSProperties, ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { MotionConfig } from "motion/react";
import { Toaster } from "sonner";
import ThemeProvider, { useTheme } from "@/components/ThemeProvider";

const toasterStyle = {
  "--normal-bg": "var(--color-surface-2)",
  "--normal-border": "var(--color-border-strong)",
  "--normal-text": "var(--color-fg)",
  "--success-bg": "var(--color-surface-2)",
  "--success-border": "var(--color-success)",
  "--success-text": "var(--color-fg)",
  "--error-bg": "var(--color-surface-2)",
  "--error-border": "var(--color-danger)",
  "--error-text": "var(--color-fg)",
  "--border-radius": "0.875rem",
  fontFamily: "var(--font-sans)",
} as CSSProperties;

function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme === "daylight" ? "light" : "dark"}
      position="top-center"
      offset={72}
      mobileOffset={{ top: 64 }}
      closeButton
      style={toasterStyle}
      toastOptions={{ classNames: { toast: "shadow-raised!", description: "text-fg-muted!" } }}
    />
  );
}

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider>
        <MotionConfig reducedMotion="user">
          {children}
          <ThemedToaster />
        </MotionConfig>
      </ThemeProvider>
    </SessionProvider>
  );
}
