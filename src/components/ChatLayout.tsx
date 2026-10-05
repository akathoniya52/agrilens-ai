"use client";

import { useState } from "react";
import type { ChatSummary } from "@/types/chat";
import ChatSidebar from "./ChatSidebar";
import ChatWindow from "./ChatWindow";
import { useChatList } from "./chat/useChatList";

export default function ChatLayout({ initialChatId = null }: { initialChatId?: string | null }) {
  const list = useChatList();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(initialChatId);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const selected = list.chats.find((chat) => chat._id === selectedChatId);

  const select = (id: string | null) => {
    setSelectedChatId(id);
    setDrawerOpen(false);
  };

  const onChatCreated = (chat: ChatSummary) => {
    list.add(chat);
    setSelectedChatId(chat._id);
  };

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
      />
    </div>
  );
}
