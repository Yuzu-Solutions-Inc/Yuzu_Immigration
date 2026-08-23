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
  getUserMicrosoftConnection,
  startMicrosoftWatch,
  stopMicrosoftWatch,
  syncMicrosoftBusy,
  type MicrosoftCalendarConnectionRow,
} from "@/lib/microsoft/calendar";
import {
  encodeMicrosoftOAuthState,
  microsoftAuthUrl,
  microsoftCalendarConfigured,
} from "@/lib/microsoft/oauth";
import { getMicrosoftCalendarSecrets } from "@/lib/microsoft/secrets";
import { createServiceClient } from "@/lib/supabase/admin";

export type MicrosoftCalendarActionState = {
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

export async function startMicrosoftCalendarConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const intent = parseIntegrationIntent(formData.get("intent"));
  const fail = (reason: string): never => {
    redirect(calendarSettingsHref(locale, { microsoft: reason }));
  };
  const gate = await requireMember();
  if (!gate.ok) return fail(gate.error);
  if (!microsoftCalendarConfigured()) return fail("not_configured");

  const origin = await getAppBaseUrl();
  const state = encodeMicrosoftOAuthState({
    organizationId: gate.membership.organization.id,
    userId: gate.user.id,
    locale,
    origin,
    intent,
  });
  redirect(microsoftAuthUrl({ origin, state }));
}

export async function useMicrosoftCalendarAction(
  locale: string,
): Promise<MicrosoftCalendarActionState> {
  return selectMicrosoftRole(locale, "calendar");
}

export async function useMicrosoftTeamsAction(
  locale: string,
): Promise<MicrosoftCalendarActionState> {
  return selectMicrosoftRole(locale, "meetings");
}

async function selectMicrosoftRole(
  locale: string,
  intent: IntegrationIntent,
): Promise<MicrosoftCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const connection = await getUserMicrosoftConnection(orgId, gate.user.id);
  if (!connection) return { error: "microsoft_not_connected" };
  try {
    await applyIntegrationIntent({
      organizationId: orgId,
      userId: gate.user.id,
      vendor: "microsoft",
      intent,
    });
    await applyCalendarProviderWatches(orgId, gate.user.id);
  } catch (error) {
    console.error("select microsoft role:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return { message: intent === "calendar" ? "using_calendar" : "using_meetings" };
}

export async function stopUsingMicrosoftCalendarAction(
  locale: string,
): Promise<MicrosoftCalendarActionState> {
  return stopMicrosoftRole(locale, "calendar");
}

export async function stopUsingMicrosoftTeamsAction(
  locale: string,
): Promise<MicrosoftCalendarActionState> {
  return stopMicrosoftRole(locale, "meetings");
}

async function stopMicrosoftRole(
  locale: string,
  intent: IntegrationIntent,
): Promise<MicrosoftCalendarActionState> {
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
    if (!vendorStillNeeded(integrations, "microsoft")) {
      await deleteMicrosoftConnection(orgId, gate.user.id);
    }
  } catch (error) {
    console.error("stop microsoft role:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return {
    message: intent === "calendar" ? "stopped_calendar" : "stopped_meetings",
  };
}

export async function disconnectMicrosoftCalendarAction(
  locale: string,
): Promise<MicrosoftCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const integrations = await getStaffBookingIntegrations(orgId, gate.user.id);
  try {
    if (integrations?.calendar_provider === "microsoft") {
      await clearCalendarProvider(orgId, gate.user.id);
    }
    if (integrations?.meeting_provider === "teams") {
      await clearMeetingProvider(orgId, gate.user.id);
    }
    await applyCalendarProviderWatches(orgId, gate.user.id);
    await deleteMicrosoftConnection(orgId, gate.user.id);
  } catch (error) {
    console.error("disconnect microsoft:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return { message: "disconnected" };
}

async function deleteMicrosoftConnection(orgId: string, userId: string) {
  const admin = createServiceClient();
  const connection = await getUserMicrosoftConnection(orgId, userId);
  if (connection) {
    await stopMicrosoftWatch(connection);
  }
  const { error } = await admin
    .from("microsoft_calendar_connections")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) {
    console.error("disconnect microsoft:", error.message);
    throw new Error("save_failed");
  }
}

export async function syncMicrosoftCalendarNowAction(
  locale: string,
): Promise<MicrosoftCalendarActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const connection = await getUserMicrosoftConnection(
    gate.membership.organization.id,
    gate.user.id,
  );
  if (!connection) return { error: "microsoft_not_connected" };
  const secrets = await getMicrosoftCalendarSecrets(connection.id);
  if (!secrets) return { error: "microsoft_reconnect_required" };
  try {
    await syncMicrosoftBusy(connection);
    const origin = await getAppBaseUrl();
    if (origin.startsWith("https://")) {
      await maybeRenewWatch(
        connection,
        `${origin}/api/calendar/microsoft/webhook`,
      );
    }
  } catch (error) {
    console.error("sync microsoft now:", error);
    return { error: "microsoft_sync_failed" };
  }
  revalidateCalendar(locale);
  return { message: "synced" };
}

async function maybeRenewWatch(
  connection: MicrosoftCalendarConnectionRow,
  webhookUrl: string,
) {
  const expires = connection.channel_expiration
    ? new Date(connection.channel_expiration).getTime()
    : 0;
  if (expires > Date.now() + 20 * 60 * 60 * 1000) return;
  await startMicrosoftWatch(connection, webhookUrl);
}
