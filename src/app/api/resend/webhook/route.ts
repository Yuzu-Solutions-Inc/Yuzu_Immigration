import { NextResponse } from "next/server";
import { Resend } from "resend";

import { processReceivedEmail } from "@/lib/email/inbound";
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
  } catch (error) {
    console.error("resend webhook verify:", error);
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  if (event.type === "email.received") {
    try {
      const result = await processReceivedEmail(event.data.email_id);
      if (
        result &&
        result.ok === false &&
        (result.reason === "fetch_failed" || result.reason === "insert_failed")
      ) {
        return NextResponse.json({ ok: false }, { status: 500 });
      }
    } catch (error) {
      console.error("resend inbound via delivery webhook:", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
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
    console.error("resend webhook handler:", error);
    return NextResponse.json({ error: "handler_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
