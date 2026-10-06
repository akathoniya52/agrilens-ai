import { after, NextRequest, NextResponse } from "next/server";
import { jsonError, safeEqual, serverError } from "@/lib/http";
import { parseInboundMessages, verifyWebhookSignature, whatsappConfig } from "@/lib/whatsapp";
import { WEBHOOK_BUDGET_MS, handleInbound } from "@/lib/whatsapp-bot";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Meta webhook verification handshake. */
export async function GET(req: NextRequest) {
  const config = whatsappConfig();
  if (!config) return jsonError("WhatsApp is not configured", 503);
  const params = req.nextUrl.searchParams;
  if (params.get("hub.mode") === "subscribe" && safeEqual(params.get("hub.verify_token") ?? "", config.verifyToken)) {
    return new Response(params.get("hub.challenge") ?? "", { headers: { "Content-Type": "text/plain" } });
  }
  return jsonError("Forbidden", 403);
}

export async function POST(req: NextRequest) {
  const deadline = Date.now() + WEBHOOK_BUDGET_MS;
  try {
    const config = whatsappConfig();
    if (!config) return jsonError("WhatsApp is not configured", 503);
    const raw = await req.text();
    if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), config.appSecret)) {
      return jsonError("Invalid signature", 401);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return jsonError("Invalid JSON body", 400);
    }
    const messages = parseInboundMessages(payload);
    // Reply 200 at once; the answers run after the response against one shared deadline.
    if (messages.length) after(() => Promise.all(messages.map((m) => handleInbound(config, m, deadline))));
    return NextResponse.json({ received: messages.length });
  } catch (error) {
    return serverError("POST /api/whatsapp", error);
  }
}
