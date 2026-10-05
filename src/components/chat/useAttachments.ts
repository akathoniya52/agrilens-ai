"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { compressImage, isImageFile } from "@/lib/image-compress";
import type { Attachment } from "@/types/chat";
import { uploadImage } from "./chat-api";

export const MAX_ATTACHMENTS = 4;
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

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
      patch(id, { status: "ready", attachment: { ...uploaded, ...(width && height ? { width, height } : {}) } });
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
  }

  function clear() {
    items.forEach((item) => remove(item.id));
  }

  function restore(attachments: Attachment[]) {
    setItems(attachments.map((attachment, i) => ({ id: `restored-${i}-${attachment.url.slice(-12)}`, preview: attachment.url, status: "ready", attachment })));
  }

  return {
    items,
    add,
    remove,
    clear,
    restore,
    uploading: items.some((item) => item.status === "uploading"),
    ready: items.flatMap((item) => (item.status === "ready" && item.attachment ? [item.attachment] : [])),
  };
}
