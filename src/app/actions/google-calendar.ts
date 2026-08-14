"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAppBaseUrl } from "@/lib/app-url";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  getOrgGoogleConnection,
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
import { createServiceClient } from "@/lib/supabase/admin";

export type GoogleCalendarActionState = {
  error?: string;
  message?: string;
};

async function requireManager() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership };
}

export async function startGoogleCalendarConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const fail = (reason: string): never => {
    redirect(`/${locale}/calendar?google=${encodeURIComponent(reason)}`);
  };
  const gate = await requireManager();
  if (!gate.ok) return fail(gate.error);
  const user = await getSessionUser();
  if (!user) return fail("unauthorized");
  if (!googleCalendarConfigured()) return fail("not_configured");

  const origin = await getAppBaseUrl();
  const state = encodeGoogleOAuthState({
    organizationId: gate.membership.organization.id,
    userId: user.id,
    locale,
  });
  redirect(googleAuthUrl({ origin, state }));
}

export async function disconnectGoogleCalendarAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const admin = createServiceClient();
  const connection = await getOrgGoogleConnection(orgId);
  if (connection) {
    await stopGoogleWatch(connection);
  }
  const { error } = await admin
    .from("google_calendar_connections")
    .delete()
    .eq("organization_id", orgId);
  if (error) {
    console.error("disconnect google:", error.message);
    return { error: "save_failed" };
  }
  revalidatePath(`/${locale}/calendar`);
  return { message: "disconnected" };
}

export async function syncGoogleCalendarNowAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const connection = await getOrgGoogleConnection(gate.membership.organization.id);
  if (!connection) return { error: "not_connected" };
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
