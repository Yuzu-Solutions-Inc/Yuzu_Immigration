"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAppBaseUrl } from "@/lib/app-url";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { trialExpiredError } from "@/lib/billing/trial";
import {
  applyIntegrationIntent,
  calendarSettingsHref,
  clearCalendarProvider,
  clearMeetingProvider,
  getStaffBookingIntegrations,
  parseIntegrationIntent,
  vendorStillNeeded,
  type IntegrationIntent,
} from "@/lib/booking/integrations";
import { applyCalendarProviderWatches } from "@/lib/calendar/staff-watches";
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
  const locked = trialExpiredError(membership);
  if (locked) return { ok: false as const, error: locked };
  return { ok: true as const, membership, user };
}

function revalidateCalendar(locale: string) {
  revalidatePath(`/${locale}/calendar`);
  revalidatePath(`/${locale}/settings/calendar`);
  revalidatePath(`/${locale}/home`);
  revalidatePath(`/${locale}/welcome`);
}

export async function startGoogleCalendarConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const intent = parseIntegrationIntent(formData.get("intent"));
  const fail = (reason: string): never => {
    redirect(
      `${calendarSettingsHref(locale, { google: reason })}`,
    );
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
    intent,
  });
  redirect(googleAuthUrl({ origin, state, intent }));
}

export async function useGoogleCalendarAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  return selectGoogleRole(locale, "calendar");
}

export async function useGoogleMeetAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  return selectGoogleRole(locale, "meetings");
}

async function selectGoogleRole(
  locale: string,
  intent: IntegrationIntent,
): Promise<GoogleCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const connection = await getUserGoogleConnection(orgId, gate.user.id);
  if (!connection) return { error: "not_connected" };
  try {
    await applyIntegrationIntent({
      organizationId: orgId,
      userId: gate.user.id,
      vendor: "google",
      intent,
    });
    await applyCalendarProviderWatches(orgId, gate.user.id);
  } catch (error) {
    console.error("select google role:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return { message: intent === "calendar" ? "using_calendar" : "using_meetings" };
}

export async function stopUsingGoogleCalendarAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  return stopGoogleRole(locale, "calendar");
}

export async function stopUsingGoogleMeetAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  return stopGoogleRole(locale, "meetings");
}

async function stopGoogleRole(
  locale: string,
  intent: IntegrationIntent,
): Promise<GoogleCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  try {
    if (intent === "calendar") {
      await clearCalendarProvider(orgId, gate.user.id);
    } else {
      await clearMeetingProvider(orgId, gate.user.id);
    }
    await applyCalendarProviderWatches(orgId, gate.user.id);
    const integrations = await getStaffBookingIntegrations(orgId, gate.user.id);
    if (!vendorStillNeeded(integrations, "google")) {
      await deleteGoogleConnection(orgId, gate.user.id);
    }
  } catch (error) {
    console.error("stop google role:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return {
    message: intent === "calendar" ? "stopped_calendar" : "stopped_meetings",
  };
}

export async function disconnectGoogleCalendarAction(
  locale: string,
): Promise<GoogleCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const integrations = await getStaffBookingIntegrations(orgId, gate.user.id);
  try {
    if (integrations?.calendar_provider === "google") {
      await clearCalendarProvider(orgId, gate.user.id);
    }
    if (integrations?.meeting_provider === "google_meet") {
      await clearMeetingProvider(orgId, gate.user.id);
    }
    await applyCalendarProviderWatches(orgId, gate.user.id);
    await deleteGoogleConnection(orgId, gate.user.id);
  } catch (error) {
    console.error("disconnect google:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return { message: "disconnected" };
}

async function deleteGoogleConnection(orgId: string, userId: string) {
  const admin = createServiceClient();
  const connection = await getUserGoogleConnection(orgId, userId);
  if (connection) {
    await stopGoogleWatch(connection);
  }
  const { error } = await admin
    .from("google_calendar_connections")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) {
    console.error("disconnect google:", error.message);
    throw new Error("save_failed");
  }
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
  revalidateCalendar(locale);
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
