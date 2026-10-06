"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ChatSummary } from "@/types/chat";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";
import { useChatList } from "./chat/useChatList";

export default function ChatLayout({ initialChatId = null }: { initialChatId?: string | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const list = useChatList();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const selected = list.chats.find((chat) => chat._id === selectedChatId);

  const select = (id: string | null) => {
    setSelectedChatId(id);
    setDrawerOpen(false);
  };

  // Only switch to a freshly created chat if the user hasn't opened another one meanwhile.
  const onChatCreated = (chat: ChatSummary) => {
    list.add(chat);
    setSelectedChatId((current) => current ?? chat._id);
  };

  // Mirror the open chat into ?c= so a reload or shared link reopens it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("c") === selectedChatId) return;
    if (selectedChatId) params.set("c", selectedChatId);
    else params.delete("c");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [selectedChatId, pathname, router]);

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] w-full min-w-0 overflow-hidden">
      <ChatSidebar
        list={list}
        selectedChatId={selectedChatId}
        onSelectChat={select}
        onNewChat={() => select(null)}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
      <ChatWindow
        chatId={selectedChatId}
        title={selected?.title}
        onChatCreated={onChatCreated}
        onChatActivity={list.touch}
        onOpenSidebar={() => setDrawerOpen(true)}
        onNewChat={() => select(null)}
      />
    </div>
  );
}
