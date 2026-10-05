"use client";

import { useEffect, useImperativeHandle, useRef, useState, type ChangeEvent, type KeyboardEvent, type Ref } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { CameraIcon, MicIcon } from "@/components/icons";
import { cx } from "@/components/ui";
import OnDeviceHint from "@/components/ondevice/OnDeviceHint";
import { getLanguage } from "@/lib/languages";
import AttachmentTray from "./AttachmentTray";
import { PaperclipIcon, SendIcon, StopIcon } from "./icons";
import { MAX_ATTACHMENTS, useAttachments } from "./useAttachments";
import type { Draft, StreamStatus } from "./useChatStream";
import { useVoiceRecorder } from "./useVoiceRecorder";
import Waveform from "./Waveform";

export interface ComposerHandle {
  addFiles: (files: Iterable<File>) => void;
  openCamera: () => void;
  setText: (text: string) => void;
  restore: (draft: Draft) => void;
}

interface ComposerProps {
  ref?: Ref<ComposerHandle>;
  status: StreamStatus;
  onSend: (draft: Draft) => Promise<boolean>;
  onStop: () => void;
}

const MAX_TEXTAREA_PX = 200;
const toolButton =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg disabled:pointer-events-none disabled:opacity-40";

export default function Composer({ ref, status, onSend, onStop }: ComposerProps) {
  const t = useTranslations("chat");
  const language = getLanguage(useLocale()).code;
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const attachments = useAttachments();
  const voice = useVoiceRecorder({
    language,
    onText: (spoken) => {
      setText((prev) => (prev.trim() ? `${prev.trimEnd()} ${spoken}` : spoken));
      textareaRef.current?.focus();
    },
  });

  const busy = status !== "idle";
  const canSend = !busy && !attachments.uploading && (text.trim().length > 0 || attachments.ready.length > 0);
  const full = attachments.items.length >= MAX_ATTACHMENTS;

  useImperativeHandle(ref, () => ({
    addFiles: attachments.add,
    openCamera: () => cameraRef.current?.click(),
    setText: (value) => {
      setText(value);
      textareaRef.current?.focus();
    },
    restore: (draft) => {
      setText(draft.content);
      attachments.restore(draft.attachments);
    },
  }));

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_PX)}px`;
  }, [text]);

  async function submit() {
    if (!canSend) return;
    const draft: Draft = { content: text.trim(), attachments: attachments.ready };
    setText("");
    attachments.clear();
    const sent = await onSend(draft);
    if (!sent) {
      setText(draft.content);
      attachments.restore(draft.attachments);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const { files } = event.target;
    if (files?.length) attachments.add(Array.from(files));
    event.target.value = "";
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="chat-composer rounded-[1.75rem] border border-border bg-surface-2/75 shadow-raised backdrop-blur-xl transition-[border-color,box-shadow] duration-300 focus-within:border-accent/55 focus-within:shadow-glow"
    >
      {attachments.items.length > 0 && <AttachmentTray items={attachments.items} onRemove={attachments.remove} />}
      <OnDeviceHint src={attachments.items[0]?.preview} className="mx-3 mt-2" />

      <div className="relative px-4 pt-3">
        <AnimatePresence mode="wait" initial={false}>
          {voice.state === "recording" ? (
            <motion.div
              key="wave"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex min-h-11 items-center gap-3"
            >
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-danger opacity-60" />
                <span className="relative h-2.5 w-2.5 rounded-full bg-danger" />
              </span>
              <span className="shrink-0 text-sm font-medium text-fg-muted" role="status">
                {t("listening")}
              </span>
              <Waveform analyser={voice.analyser} className="min-w-0 flex-1" />
            </motion.div>
          ) : (
            <motion.textarea
              key="text"
              ref={textareaRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              rows={1}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={onKeyDown}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData.files);
                if (!files.length) return;
                event.preventDefault();
                attachments.add(files);
              }}
              placeholder={voice.state === "transcribing" ? t("transcribing") : t("composerPlaceholder")}
              aria-label={t("composerPlaceholder")}
              className="block max-h-[200px] min-h-11 w-full resize-none bg-transparent py-2 text-base leading-relaxed text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none"
            />
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-1 px-2 pb-2 pt-1">
        <button type="button" className={toolButton} onClick={() => fileRef.current?.click()} disabled={full} aria-label={t("attachImage")} title={t("attachImage")}>
          <PaperclipIcon />
        </button>
        <button
          type="button"
          className={cx(toolButton, "hidden pointer-coarse:flex")}
          onClick={() => cameraRef.current?.click()}
          disabled={full}
          aria-label={t("takePhoto")}
          title={t("takePhoto")}
        >
          <CameraIcon width={18} height={18} />
        </button>
        <button
          type="button"
          className={cx(toolButton, voice.state === "recording" && "bg-danger/12 text-danger hover:bg-danger/20 hover:text-danger")}
          onClick={voice.state === "recording" ? voice.stop : voice.start}
          disabled={voice.state === "transcribing"}
          aria-label={voice.state === "recording" ? t("stopRecording") : t("recordVoice")}
          title={voice.state === "recording" ? t("stopRecording") : t("recordVoice")}
          aria-pressed={voice.state === "recording"}
        >
          {voice.state === "transcribing" ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
          ) : (
            <MicIcon width={18} height={18} />
          )}
        </button>

        <span className="ml-auto hidden pr-2 text-xs text-fg-subtle lg:block">{t("sendHint")}</span>

        {busy ? (
          <button
            type="button"
            onClick={onStop}
            aria-label={t("stop")}
            title={t("stop")}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-2xl border border-border-strong bg-surface-3 text-fg transition hover:border-danger/60 hover:text-danger lg:ml-0"
          >
            <StopIcon width={16} height={16} />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!canSend}
            aria-label={t("send")}
            title={t("send")}
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-accent text-accent-fg shadow-glow transition hover:brightness-110 active:scale-95 disabled:bg-surface-3 disabled:text-fg-subtle disabled:shadow-none lg:ml-0"
          >
            <SendIcon strokeWidth={2.2} />
          </button>
        )}
      </div>

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={onPickFiles} />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={onPickFiles}
      />
    </form>
  );
}
