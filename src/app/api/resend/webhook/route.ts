import { NextResponse } from "next/server";
import { Resend } from "resend";

import { applyOutboundEmailEvent } from "@/lib/email/outbound";

function resendWebhookConfig() {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!apiKey || !webhookSecret) return null;
  return { apiKey, webhookSecret };
}

export async function POST(request: Request) {
  const config = resendWebhookConfig();
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
  } catch {
    console.error("resend webhook verify: invalid_signature");
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  // Inbound CRM messaging is disabled — ignore email.received.
  if (event.type === "email.received") {
    return NextResponse.json({ ok: true, ignored: "inbound_disabled" });
  }

  try {
    switch (event.type) {
      case "email.delivered":
        await applyOutboundEmailEvent({
          resendEmailId: event.data.email_id,
          status: "delivered",
          recipients: event.data.to,
        });
        break;
      case "email.delivery_delayed":
        await applyOutboundEmailEvent({
          resendEmailId: event.data.email_id,
          status: "delayed",
          recipients: event.data.to,
        });
        break;
      case "email.bounced":
      case "email.failed":
      case "email.suppressed":
        await applyOutboundEmailEvent({
          resendEmailId: event.data.email_id,
          status: event.type === "email.bounced" ? "bounced" : "failed",
          recipients: event.data.to,
          suppress: "bounced",
        });
        break;
      case "email.complained":
        await applyOutboundEmailEvent({
          resendEmailId: event.data.email_id,
          status: "complained",
          recipients: event.data.to,
          suppress: "complained",
        });
        break;
      default:
        break;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "handler_failed";
    console.error("resend webhook handler:", message);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
