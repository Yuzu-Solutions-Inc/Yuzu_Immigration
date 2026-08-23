"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getAppBaseUrl } from "@/lib/app-url";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { trialExpiredError } from "@/lib/billing/trial";
import {
  applyMeetingProvider,
  calendarSettingsHref,
  clearMeetingProvider,
  getStaffBookingIntegrations,
  zoomStillNeeded,
} from "@/lib/booking/integrations";
import { getUserZoomConnection } from "@/lib/zoom/meetings";
import {
  encodeZoomOAuthState,
  zoomAuthUrl,
  zoomConfigured,
} from "@/lib/zoom/oauth";
import { getZoomSecrets } from "@/lib/zoom/secrets";
import { createServiceClient } from "@/lib/supabase/admin";

export type ZoomActionState = {
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

export async function startZoomConnectAction(formData: FormData) {
  const locale = String(formData.get("locale") || "en");
  const fail = (reason: string): never => {
    redirect(calendarSettingsHref(locale, { zoom: reason }));
  };
  const gate = await requireMember();
  if (!gate.ok) return fail(gate.error);
  if (!zoomConfigured()) return fail("not_configured");

  const origin = await getAppBaseUrl();
  const state = encodeZoomOAuthState({
    organizationId: gate.membership.organization.id,
    userId: gate.user.id,
    locale,
    origin,
  });
  redirect(zoomAuthUrl({ origin, state }));
}

export async function useZoomMeetingsAction(
  locale: string,
): Promise<ZoomActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const connection = await getUserZoomConnection(orgId, gate.user.id);
  if (!connection) return { error: "zoom_not_connected" };
  const secrets = await getZoomSecrets(connection.id);
  if (!secrets) return { error: "zoom_reconnect_required" };
  try {
    await applyMeetingProvider({
      organizationId: orgId,
      userId: gate.user.id,
      meeting: "zoom",
    });
  } catch (error) {
    console.error("select zoom meetings:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return { message: "using_meetings" };
}

export async function stopUsingZoomMeetingsAction(
  locale: string,
): Promise<ZoomActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  try {
    await clearMeetingProvider(orgId, gate.user.id);
    const integrations = await getStaffBookingIntegrations(orgId, gate.user.id);
    if (!zoomStillNeeded(integrations)) {
      await deleteZoomConnection(orgId, gate.user.id);
    }
  } catch (error) {
    console.error("stop zoom meetings:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return { message: "stopped_meetings" };
}

export async function disconnectZoomAction(
  locale: string,
): Promise<ZoomActionState> {
  const gate = await requireMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const integrations = await getStaffBookingIntegrations(orgId, gate.user.id);
  try {
    if (integrations?.meeting_provider === "zoom") {
      await clearMeetingProvider(orgId, gate.user.id);
    }
    await deleteZoomConnection(orgId, gate.user.id);
  } catch (error) {
    console.error("disconnect zoom:", error);
    return { error: "save_failed" };
  }
  revalidateCalendar(locale);
  return { message: "disconnected" };
}

async function deleteZoomConnection(orgId: string, userId: string) {
  const admin = createServiceClient();
  const { error } = await admin
    .from("zoom_connections")
    .delete()
    .eq("organization_id", orgId)
    .eq("user_id", userId);
  if (error) {
    console.error("disconnect zoom:", error.message);
    throw new Error("save_failed");
  }
}
