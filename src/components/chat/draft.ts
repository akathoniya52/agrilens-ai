import type { Attachment } from "@/types/chat";

/** Puts a restored (older) draft in front of whatever the user typed since, without duplicating it. */
export function mergeDraftText(restored: string, current: string): string {
  const older = restored.trim();
  const newer = current.trim();
  if (!older) return current;
  if (!newer) return restored;
  if (newer.includes(older)) return current;
  return `${older}\n${newer}`;
}

/** Restored attachments that aren't already in the tray, limited to the free slots. */
export function pickRestorable(currentUrls: Iterable<string>, restored: Attachment[], room: number): Attachment[] {
  const seen = new Set(currentUrls);
  const picked: Attachment[] = [];
  for (const attachment of restored) {
    if (picked.length >= room) break;
    if (seen.has(attachment.url)) continue;
    seen.add(attachment.url);
    picked.push(attachment);
  }
  return picked;
}
