import { createHmac, timingSafeEqual } from "node:crypto";
import { readCapped } from "@/lib/media";

const GRAPH_URL = "https://graph.facebook.com";
export const WHATSAPP_MAX_TEXT = 4096;
export const WHATSAPP_TIMEOUT_MS = 10_000;

/** Every Graph API call gets WHATSAPP_TIMEOUT_MS, cut shorter by the caller's deadline signal. */
function requestSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(WHATSAPP_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

export const normalizePhone = (value: string) => value.replace(/\D/g, "").replace(/^00/, "");

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  graphVersion: string;
}

export function whatsappConfig(): WhatsAppConfig | null {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN } = process.env;
  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID || !WHATSAPP_APP_SECRET || !WHATSAPP_VERIFY_TOKEN) return null;
  return {
    token: WHATSAPP_TOKEN,
    phoneNumberId: WHATSAPP_PHONE_NUMBER_ID,
    appSecret: WHATSAPP_APP_SECRET,
    verifyToken: WHATSAPP_VERIFY_TOKEN,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v21.0",
  };
}

/** Validates Meta's `X-Hub-Signature-256: sha256=<hex HMAC of the raw body>` in constant time. */
export function verifyWebhookSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=") || !appSecret) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const given = Buffer.from(header.slice(7), "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export interface InboundMessage {
  id: string;
  from: string;
  type: "text" | "image";
  text: string;
  imageId: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Extracts text/image user messages from a WhatsApp Cloud API webhook payload (statuses are ignored). */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  if (!isRecord(payload) || payload.object !== "whatsapp_business_account") return [];
  const out: InboundMessage[] = [];
  for (const entry of asArray(payload.entry)) {
    if (!isRecord(entry)) continue;
    for (const change of asArray(entry.changes)) {
      if (!isRecord(change) || !isRecord(change.value)) continue;
      for (const m of asArray(change.value.messages)) {
        if (!isRecord(m) || !str(m.id) || !str(m.from)) continue;
        if (m.type === "text" && isRecord(m.text)) {
          out.push({ id: str(m.id), from: normalizePhone(str(m.from)), type: "text", text: str(m.text.body).trim(), imageId: null });
        } else if (m.type === "image" && isRecord(m.image) && str(m.image.id)) {
          out.push({
            id: str(m.id),
            from: normalizePhone(str(m.from)),
            type: "image",
            text: str(m.image.caption).trim(),
            imageId: str(m.image.id),
          });
        }
      }
    }
  }
  return out;
}

/** WhatsApp uses *bold* / _italic_; flatten Markdown headings, bold and links. */
export function toWhatsAppText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+(.+)$/gm, "*$1*")
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)")
    .trim();
}

export function splitMessage(text: string, max = WHATSAPP_MAX_TEXT): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const cut = Math.max(rest.lastIndexOf("\n", max), rest.lastIndexOf(" ", max));
    const at = cut > max * 0.5 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendWhatsAppText(config: WhatsAppConfig, to: string, text: string, signal?: AbortSignal): Promise<void> {
  for (const body of splitMessage(toWhatsAppText(text))) {
    const res = await fetch(`${GRAPH_URL}/${config.graphVersion}/${config.phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body, preview_url: false } }),
      signal: requestSignal(signal),
    });
    if (!res.ok) throw new Error(`WhatsApp send failed (${res.status}): ${(await res.text()).slice(0, 500)}`);
  }
}

/** The access token is only ever sent to Meta's own media CDN. */
export function isMetaMediaUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "https:" &&
      ["fbsbx.com", "facebook.com", "whatsapp.net"].some((domain) => hostname === domain || hostname.endsWith(`.${domain}`))
    );
  } catch {
    return false;
  }
}

export async function downloadWhatsAppMedia(
  config: WhatsAppConfig,
  mediaId: string,
  maxBytes: number,
  signal?: AbortSignal
): Promise<{ data: Uint8Array; mimeType: string }> {
  const auth = { Authorization: `Bearer ${config.token}` };
  const meta = await fetch(`${GRAPH_URL}/${config.graphVersion}/${encodeURIComponent(mediaId)}`, {
    headers: auth,
    signal: requestSignal(signal),
  });
  if (!meta.ok) throw new Error(`WhatsApp media lookup failed (${meta.status})`);
  const info: unknown = await meta.json();
  if (!isRecord(info) || !str(info.url)) throw new Error("WhatsApp media has no URL");
  if (typeof info.file_size === "number" && info.file_size > maxBytes) throw new Error("Image too large");
  if (!isMetaMediaUrl(str(info.url))) throw new Error("Unexpected WhatsApp media host");
  const file = await fetch(str(info.url), { headers: auth, redirect: "error", signal: requestSignal(signal) });
  if (!file.ok) throw new Error(`WhatsApp media download failed (${file.status})`);
  const declared = Number(file.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("Image too large");
  const data = await readCapped(file, maxBytes);
  return { data, mimeType: str(info.mime_type) || file.headers.get("content-type") || "image/jpeg" };
}
