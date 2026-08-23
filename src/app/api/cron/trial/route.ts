import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { processDueTrialEmails } from "@/lib/email/trial";

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
    const result = await processDueTrialEmails();
    return NextResponse.json({ ok: true, trial: result });
  } catch (error) {
    console.error("trial email cron:", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
