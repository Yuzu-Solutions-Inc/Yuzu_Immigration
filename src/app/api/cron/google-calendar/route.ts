import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { refreshAllGoogleCalendars } from "@/lib/google/calendar";
import { refreshAllMicrosoftCalendars } from "@/lib/microsoft/calendar";

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
    const [google, microsoft] = await Promise.all([
      refreshAllGoogleCalendars(),
      refreshAllMicrosoftCalendars(),
    ]);
    return NextResponse.json({ ok: true, google, microsoft });
  } catch (error) {
    console.error("calendar cron:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}
