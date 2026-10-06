"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { compressImage, isImageFile } from "@/lib/image-compress";
import type { Attachment } from "@/types/chat";
import { uploadImage } from "./chat-api";
import { pickRestorable } from "./draft";

export const MAX_ATTACHMENTS = 4;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export interface PendingImage {
  id: string;
  preview: string;
  status: "uploading" | "ready" | "error";
  attachment?: Attachment;
}

async function prepare(file: File): Promise<{ blob: Blob; name: string; width?: number; height?: number }> {
  try {
    const { blob, width, height, type } = await compressImage(file);
    return { blob, width, height, name: `leaf.${type === "image/webp" ? "webp" : "jpg"}` };
  } catch {
    return { blob: file, name: file.name || "leaf.jpg" };
  }
}

export function useAttachments() {
  const t = useTranslations("chat");
  const [items, setItems] = useState<PendingImage[]>([]);
  const previews = useRef(new Set<string>());
  const sources = useRef(new Map<string, File>());

  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const patch = (id: string, next: Partial<PendingImage>) =>
    setItems((list) => list.map((item) => (item.id === id ? { ...item, ...next } : item)));

  async function upload(id: string, file: File) {
    const { blob, name, width, height } = await prepare(file);
    if (blob.size > MAX_UPLOAD_BYTES) {
      toast.error(t("imageTooLarge"));
      remove(id);
      return;
    }
    try {
      const uploaded = await uploadImage(blob, name);
      const size = uploaded.width && uploaded.height ? {} : width && height ? { width, height } : {};
      patch(id, { status: "ready", attachment: { ...uploaded, ...size } });
      sources.current.delete(id);
    } catch {
      patch(id, { status: "error" });
      toast.error(t("uploadFailed"));
    }
  }

  function add(files: Iterable<File>) {
    const images = Array.from(files).filter(isImageFile);
    if (!images.length) {
      toast.error(t("unsupportedImage"));
      return;
    }
    const room = MAX_ATTACHMENTS - items.length;
    if (images.length > room) toast.error(t("tooManyImages", { max: MAX_ATTACHMENTS }));
    const accepted = images.slice(0, Math.max(0, room)).map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      sources.current.set(preview, file);
      return { file, item: { id: preview, preview, status: "uploading" as const } };
    });
    if (!accepted.length) return;
    setItems((list) => [...list, ...accepted.map((a) => a.item)]);
    accepted.forEach(({ file, item }) => void upload(item.id, file));
  }

  function remove(id: string) {
    setItems((list) => list.filter((item) => item.id !== id));
    URL.revokeObjectURL(id);
    previews.current.delete(id);
    sources.current.delete(id);
  }

  function retry(id: string) {
    const file = sources.current.get(id);
    if (!file) {
      remove(id);
      return;
    }
    patch(id, { status: "uploading" });
    void upload(id, file);
  }

  function clear() {
    items.forEach((item) => remove(item.id));
  }

  /** Adds a failed send's images back next to anything attached since, instead of replacing the tray. */
  function restore(attachments: Attachment[]) {
    setItems((list) => {
      const urls = list.flatMap((item) => (item.attachment ? [item.attachment.url] : []));
      const restored = pickRestorable(urls, attachments, MAX_ATTACHMENTS - list.length).map(
        (attachment): PendingImage => ({ id: `restored-${crypto.randomUUID()}`, preview: attachment.url, status: "ready", attachment })
      );
      return [...restored, ...list];
    });
  }

  return {
    items,
    add,
    remove,
    clear,
    restore,
    retry,
    failed: items.some((item) => item.status === "error"),
    uploading: items.some((item) => item.status === "uploading"),
    ready: items.flatMap((item) => (item.status === "ready" && item.attachment ? [item.attachment] : [])),
  };
}
