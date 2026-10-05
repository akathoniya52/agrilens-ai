"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { getLanguage } from "@/lib/languages";

function toSpeakable(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+[.)])\s+/gm, "")
    .replace(/[*_~`|]/g, "")
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.split("-")[0];
  return voices.find((v) => v.lang === lang) ?? voices.find((v) => v.lang.startsWith(base));
}

export function useSpeech() {
  const t = useTranslations("chat");
  const lang = getLanguage(useLocale()).speech;
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  useEffect(() => () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }, []);

  function stop() {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  }

  function toggle(id: string, markdown: string) {
    if (!("speechSynthesis" in window)) {
      toast.error(t("ttsUnsupported"));
      return;
    }
    if (speakingId === id) {
      stop();
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(toSpeakable(markdown));
    utterance.lang = lang;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    utterance.rate = 0.95;
    utterance.onend = () => setSpeakingId((current) => (current === id ? null : current));
    utterance.onerror = utterance.onend;
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  return { speakingId, toggle };
}
