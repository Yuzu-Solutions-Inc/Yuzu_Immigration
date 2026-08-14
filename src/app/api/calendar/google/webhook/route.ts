import { NextResponse } from "next/server";

import {
  getGoogleConnectionById,
  syncGoogleBusy,
  verifyGoogleChannelToken,
  type GoogleCalendarConnectionRow,
} from "@/lib/google/calendar";
import { createServiceClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const channelId = request.headers.get("x-goog-channel-id");
  const resourceState = request.headers.get("x-goog-resource-state");
  const channelToken = request.headers.get("x-goog-channel-token");

  if (!channelId) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const admin = createServiceClient();
  const { data } = await admin
    .from("google_calendar_connections")
    .select("*")
    .eq("channel_id", channelId)
    .maybeSingle();
  const connection = data as GoogleCalendarConnectionRow | null;
  if (!connection) {
    return NextResponse.json({ ok: true });
  }

  const valid = await verifyGoogleChannelToken(connection.id, channelToken);
  if (!valid) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }

  if (resourceState === "sync") {
    return NextResponse.json({ ok: true });
  }

  try {
    const fresh = await getGoogleConnectionById(connection.id);
    if (fresh) await syncGoogleBusy(fresh);
  } catch (error) {
    console.error("google webhook sync:", error);
  }

  return NextResponse.json({ ok: true });
}
