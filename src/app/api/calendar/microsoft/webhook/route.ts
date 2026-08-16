import { NextResponse } from "next/server";

import {
  getMicrosoftConnectionByChannelId,
  getMicrosoftConnectionById,
  syncMicrosoftBusy,
  verifyMicrosoftChannelToken,
} from "@/lib/microsoft/calendar";

type GraphNotification = {
  subscriptionId?: string;
  clientState?: string;
  changeType?: string;
  lifecycleEvent?: string;
};

export async function POST(request: Request) {
  const url = new URL(request.url);
  const validationToken = url.searchParams.get("validationToken");
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  let payload: { value?: GraphNotification[] };
  try {
    payload = (await request.json()) as { value?: GraphNotification[] };
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const notifications = payload.value ?? [];
  const seen = new Set<string>();
  for (const notification of notifications) {
    const subscriptionId = notification.subscriptionId;
    if (!subscriptionId || seen.has(subscriptionId)) continue;
    seen.add(subscriptionId);

    const connection = await getMicrosoftConnectionByChannelId(subscriptionId);
    if (!connection) continue;

    const valid = await verifyMicrosoftChannelToken(
      connection.id,
      notification.clientState ?? null,
    );
    if (!valid) {
      console.error("microsoft webhook token mismatch:", subscriptionId);
      continue;
    }

    try {
      const fresh = await getMicrosoftConnectionById(connection.id);
      if (fresh) await syncMicrosoftBusy(fresh);
    } catch (error) {
      console.error("microsoft webhook sync:", error);
    }
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
