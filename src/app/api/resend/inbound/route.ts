import { NextResponse } from "next/server";

/**
 * Inbound CRM email filing is disabled. Resend may still deliver email.received
 * here if the webhook was left configured — acknowledge and drop.
 */
export async function POST() {
  return NextResponse.json({ ok: true, ignored: "inbound_disabled" });
}
