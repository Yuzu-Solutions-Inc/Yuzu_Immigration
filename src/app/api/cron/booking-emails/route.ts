import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { processDueBookingAutomations } from "@/lib/email/booking-automations";

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function run(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  try {
    const result = await processDueBookingAutomations();
    const { pruneBookingAbuseEvents } = await import("@/lib/booking/abuse");
    await pruneBookingAbuseEvents();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("booking automation cron:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}
