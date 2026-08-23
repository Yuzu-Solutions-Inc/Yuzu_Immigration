import { NextResponse } from "next/server";

import { applyTrialEmailUnsubscribe } from "@/lib/email/trial-unsubscribe";

export async function POST(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  await applyTrialEmailUnsubscribe(token);
  return NextResponse.json({ ok: true });
}
