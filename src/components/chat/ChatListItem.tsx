"use client";

import { useState, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui";
import type { ChatSummary } from "@/types/chat";
import { MoreIcon } from "./icons";

interface ChatListItemProps {
  chat: ChatSummary;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onOpenMenu: (x: number, y: number) => void;
  onRename: (title: string) => void;
  onCancelEdit: () => void;
}

export default function ChatListItem({ chat, active, editing, onSelect, onOpenMenu, onRename, onCancelEdit }: ChatListItemProps) {
  const t = useTranslations("chat");
  const [draft, setDraft] = useState(chat.title);

  if (editing) {
    const commit = () => {
      const title = draft.trim();
      if (title && title !== chat.title) onRename(title);
      else onCancelEdit();
    };
    return (
      <input
        autoFocus
        value={draft}
        maxLength={120}
        aria-label={t("rename")}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit();
          if (event.key === "Escape") onCancelEdit();
        }}
        className="h-10 w-full rounded-xl border border-accent/60 bg-surface px-3 text-sm text-fg shadow-glow outline-none"
      />
    );
  }

  const openFromButton = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onOpenMenu(rect.right, rect.bottom + 4);
  };

  return (
    <div
      className={cx(
        "group/item relative flex h-10 items-center rounded-xl transition-colors",
        active ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-3/60 hover:text-fg"
      )}
      onContextMenu={(event) => {
        event.preventDefault();
        onOpenMenu(event.clientX, event.clientY);
      }}
    >
      {active && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-accent" />}
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "page" : undefined}
        title={chat.title}
        className="h-full min-w-0 flex-1 truncate rounded-xl pl-3 pr-1 text-left text-sm"
      >
        {chat.title}
      </button>
      <button
        type="button"
        onClick={openFromButton}
        aria-label={t("chatOptions")}
        aria-haspopup="menu"
        className={cx(
          "mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-fg-subtle transition hover:bg-surface hover:text-fg",
          active ? "opacity-100" : "opacity-100 md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100"
        )}
      >
        <MoreIcon width={16} height={16} />
      </button>
    </div>
  );
}
