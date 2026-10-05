"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import ChatLayout from "@/components/ChatLayout";
import { MessagesSkeleton } from "@/components/chat/ChatSkeleton";

const OBJECT_ID = /^[a-f\d]{24}$/i;

function Skeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-6 sm:px-6">
      <MessagesSkeleton />
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<Skeleton />}>
      <ChatPageInner />
    </Suspense>
  );
}

function ChatPageInner() {
  const { status } = useSession();
  const router = useRouter();
  const requested = useSearchParams().get("c");
  const initialChatId = requested && OBJECT_ID.test(requested) ? requested : null;

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/signin");
  }, [status, router]);

  if (status !== "authenticated") return <Skeleton />;

  return <ChatLayout initialChatId={initialChatId} />;
}
