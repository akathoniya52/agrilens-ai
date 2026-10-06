"use client";

import Image from "next/image";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { FadeIn } from "@/components/ui";
import { DEFAULT_CALLBACK_URL, safeCallbackUrl } from "@/lib/callback-url";

export default function SignInPage() {
  // useSearchParams needs a Suspense boundary; the fallback renders the same card with the default target.
  return (
    <Suspense fallback={<SignInCard callbackUrl={DEFAULT_CALLBACK_URL} />}>
      <SignInWithCallback />
    </Suspense>
  );
}

function SignInWithCallback() {
  const searchParams = useSearchParams();
  return <SignInCard callbackUrl={safeCallbackUrl(searchParams.get("callbackUrl"))} />;
}

function SignInCard({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations("auth");

  return (
    <main className="relative isolate flex min-h-[calc(100dvh-56px)] items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="absolute inset-0 -z-10">
        <div className="aurora" />
        <div className="field-rows absolute inset-0" />
        <div className="grain absolute inset-0" />
      </div>

      <FadeIn className="w-full max-w-md rounded-[2rem] border border-border-strong bg-surface-2/85 p-7 text-center shadow-raised backdrop-blur-xl sm:p-10">
        <Image src="/logo_with_name.png" alt="AgriLens AI" width={120} height={120} priority className="mx-auto h-24 w-24 rounded-2xl" />
        <h1 className="mt-6 font-display text-3xl font-bold text-fg">{t("welcome")}</h1>
        <p className="mt-3 leading-relaxed text-fg-muted">{t("subtitle")}</p>
        <button
          type="button"
          onClick={() => signIn("google", { callbackUrl })}
          className="mt-8 flex min-h-13 w-full items-center justify-center gap-3 rounded-2xl bg-accent px-5 font-semibold text-accent-fg shadow-glow transition hover:brightness-110 active:scale-[0.99]"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {t("google")}
        </button>
        <p className="mt-6 text-xs leading-relaxed text-fg-subtle">{t("terms")}</p>
      </FadeIn>
    </main>
  );
}
