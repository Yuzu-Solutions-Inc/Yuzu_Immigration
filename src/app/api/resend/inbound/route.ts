import { NextResponse } from "next/server";
import { Resend } from "resend";

import { processReceivedEmail } from "@/lib/email/inbound";

export const maxDuration = 60;

function inboundWebhookConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const webhookSecret =
    process.env.RESEND_INBOUND_WEBHOOK_SECRET?.trim() ||
    process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!apiKey || !webhookSecret) return null;
  return { apiKey, webhookSecret };
}

export async function POST(request: Request) {
  const config = inboundWebhookConfig();
  if (!config) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const payload = await request.text();
  const id = request.headers.get("svix-id");
  const timestamp = request.headers.get("svix-timestamp");
  const signature = request.headers.get("svix-signature");
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ error: "missing_headers" }, { status: 400 });
  }

  const resend = new Resend(config.apiKey);
  let event;
  try {
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret: config.webhookSecret,
    });
  } catch (error) {
    console.error("resend inbound verify:", error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  try {
    if (event.type === "email.received") {
      const result = await processReceivedEmail(event.data.email_id);
      if (
        result &&
        result.ok === false &&
        (result.reason === "fetch_failed" || result.reason === "insert_failed")
      ) {
        return NextResponse.json({ ok: false }, { status: 500 });
      }
    }
  } catch (error) {
    console.error("resend inbound handler:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
