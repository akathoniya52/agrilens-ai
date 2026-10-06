"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { signInUrl } from "@/lib/callback-url";
import { useTranslations } from "next-intl";
import { FadeIn, Skeleton } from "@/components/ui";
import ScanCamera from "@/components/scan/ScanCamera";

export default function ScanPage() {
  const t = useTranslations("scan");
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") router.replace(signInUrl(window.location.pathname + window.location.search));
  }, [status, router]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
      <FadeIn className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fg sm:text-4xl">{t("title")}</h1>
        <p className="mt-1 text-fg-muted">{t("subtitle")}</p>
      </FadeIn>
      {status === "authenticated" ? <ScanCamera /> : <Skeleton className="aspect-[4/3] rounded-3xl" />}
    </main>
  );
}
