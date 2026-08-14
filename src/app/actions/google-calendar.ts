"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAppBaseUrl } from "@/lib/app-url";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  getUserGoogleConnection,
  startGoogleWatch,
  stopGoogleWatch,
  syncGoogleBusy,
  type GoogleCalendarConnectionRow,
} from "@/lib/google/calendar";
import {
  encodeGoogleOAuthState,
  googleAuthUrl,
  googleCalendarConfigured,
} from "@/lib/google/oauth";
import { getGoogleCalendarSecrets } from "@/lib/google/secrets";
import { createServiceClient } from "@/lib/supabase/admin";

export type GoogleCalendarActionState = {
  error?: string;
  message?: string;
};

async function requireMember() {
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    return { ok: false as const, error: "unauthorized" as const };
  }
  return { ok: true as const, membership, user };
}

export async function startGoogleCalendarConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const fail = (reason: string): never => {
    redirect(`/${locale}/calendar/settings?google=${encodeURIComponent(reason)}`);
  };
  const gate = await requireMember();
  if (!gate.ok) return fail(gate.error);
  if (!googleCalendarConfigured()) return fail("not_configured");

  const origin = await getAppBaseUrl();
  const state = encodeGoogleOAuthState({
    organizationId: gate.membership.organization.id,
    userId: gate.user.id,
    locale,
    origin,
  });
  redirect(googleAuthUrl({ origin, state }));
}

export async function disconnectGoogleCalendarAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const admin = createServiceClient();
  const connection = await getUserGoogleConnection(orgId, gate.user.id);
  if (connection) {
    await stopGoogleWatch(connection);
  }
  const { error } = await admin
    .from("google_calendar_connections")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", gate.user.id);
  if (error) {
    console.error("disconnect google:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${locale}/calendar`);
  revalidatePath(`/${locale}/calendar/settings`);
  return { message: "disconnected" };
}

export async function syncGoogleCalendarNowAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const connection = await getUserGoogleConnection(
    gate.membership.organization.id,
    gate.user.id,
  );
  if (!connection) return { error: "not_connected" };
  const secrets = await getGoogleCalendarSecrets(connection.id);
  if (!secrets) return { error: "reconnect_required" };
  try {
    await syncGoogleBusy(connection);
    const origin = await getAppBaseUrl();
    if (origin.startsWith("https://")) {
      await maybeRenewWatch(connection, `${origin}/api/calendar/google/webhook`);
    }
  } catch (error) {
    console.error("sync google now:", error);
    return { error: "sync_failed" };
  }
  revalidatePath(`/${locale}/calendar`);
  revalidatePath(`/${locale}/calendar/settings`);
  return { message: "synced" };
}

async function maybeRenewWatch(
  connection: GoogleCalendarConnectionRow,
  webhookUrl: string,
) {
  const expires = connection.channel_expiration
    ? new Date(connection.channel_expiration).getTime()
    : 0;
  if (expires > Date.now() + 2 * 86_400_000) return;
  await startGoogleWatch(connection, webhookUrl);
}
