"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { sendPortalInviteEmail } from "@/lib/email/portal-invite";
import { portalUrl, type PortalAccessRow } from "@/lib/portal/auth";
import { getPerson } from "@/lib/crm/queries";
import { recordAuditEvent } from "@/lib/security/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import { toAppLocale } from "@/lib/i18n/locales";

import type { PortalStaffActionState } from "./portal-state";

const uuid = z.string().uuid();

function asAccess(data: unknown): PortalAccessRow | null {
  const raw = Array.isArray(data) ? data[0] : data;
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.person_id !== "string") {
    return null;
  }
  return {
    id: row.id,
    person_id: row.person_id,
    organization_id: String(row.organization_id),
    access_code: String(row.access_code),
    access_token: String(row.access_token),
    is_active: row.is_active !== false,
    expires_at: (row.expires_at as string | null) ?? null,
    last_authenticated_at: (row.last_authenticated_at as string | null) ?? null,
  };
}

async function requireStaffActor() {
  const user = await getSessionUser();
  const membership = await getPrimaryMembership();
  if (!user || !membership) return { error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) return { error: "forbidden" as const };
  return { user, membership };
}

async function sendInvite(input: {
  personId: string;
  locale: string;
  access: PortalAccessRow;
  reset?: boolean;
}) {
  const person = await getPerson(input.personId);
  if (!person) return { error: "not_found" as const };
  const email = person.email?.trim();
  if (!email) return { error: "no_email" as const };

  const admin = createServiceClient();
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", input.access.organization_id)
    .maybeSingle();

  const base = await getAppBaseUrl();
  const locale = toAppLocale(person.preferred_locale || input.locale);
  const url = portalUrl(base, locale, input.access.access_token);
  const result = await sendPortalInviteEmail({
    locale,
    to: email,
    clientName: `${person.first_name} ${person.last_name}`.trim() || email,
    organizationName: String(org?.name ?? ""),
    portalUrl: url,
    accessCode: input.access.access_code,
    reset: input.reset,
  });
  if (!result.sent) return { error: "email_not_configured" as const };
  return { portalUrl: url };
}

export async function enablePersonPortalAction(
  _prev: PortalStaffActionState,
  formData: FormData,
): Promise<PortalStaffActionState> {
  const parsed = uuid.safeParse(String(formData.get("personId") || ""));
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  if (!parsed.success) return { error: "invalid" };

  const actor = await requireStaffActor();
  if ("error" in actor) return { error: actor.error };

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("enable_customer_portal", {
    p_person_id: parsed.data,
    p_actor_user_id: actor.user.id,
  });
  if (error) {
    console.error("enable_customer_portal:", error.message);
    return { error: "enable_failed" };
  }
  const access = asAccess(data);
  if (!access) return { error: "enable_failed" };

  void recordAuditEvent({
    organizationId: access.organization_id,
    actorUserId: actor.user.id,
    actorKind: "staff",
    action: "portal.enable",
    resourceType: "person",
    resourceId: parsed.data,
  }).catch((err) => console.error("portal staff audit:", err));

  const invited = await sendInvite({
    personId: parsed.data,
    locale,
    access,
  });

  const base = await getAppBaseUrl();
  const url = portalUrl(base, locale, access.access_token);
  revalidatePath(`/${locale}/people/${parsed.data}`);

  if (invited.error === "no_email") {
    return {
      message: "enabled",
      accessCode: access.access_code,
      portalUrl: url,
    };
  }
  if (invited.error) {
    return {
      error: invited.error,
      accessCode: access.access_code,
      portalUrl: url,
    };
  }
  return {
    message: "invited",
    accessCode: access.access_code,
    portalUrl: invited.portalUrl ?? url,
  };
}

export async function disablePersonPortalAction(
  _prev: PortalStaffActionState,
  formData: FormData,
): Promise<PortalStaffActionState> {
  const parsed = uuid.safeParse(String(formData.get("personId") || ""));
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  if (!parsed.success) return { error: "invalid" };

  const actor = await requireStaffActor();
  if ("error" in actor) return { error: actor.error };

  const admin = createServiceClient();
  const { error } = await admin.rpc("set_customer_portal_active", {
    p_person_id: parsed.data,
    p_actor_user_id: actor.user.id,
    p_is_active: false,
  });
  if (error) {
    console.error("set_customer_portal_active:", error.message);
    return { error: "disable_failed" };
  }

  void recordAuditEvent({
    organizationId: actor.membership.organization.id,
    actorUserId: actor.user.id,
    actorKind: "staff",
    action: "portal.disable",
    resourceType: "person",
    resourceId: parsed.data,
  }).catch((err) => console.error("portal staff audit:", err));

  revalidatePath(`/${locale}/people/${parsed.data}`);
  return { message: "disabled" };
}

export async function resendPersonPortalInviteAction(
  _prev: PortalStaffActionState,
  formData: FormData,
): Promise<PortalStaffActionState> {
  const parsed = uuid.safeParse(String(formData.get("personId") || ""));
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  if (!parsed.success) return { error: "invalid" };

  const actor = await requireStaffActor();
  if ("error" in actor) return { error: actor.error };

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("customer_portal_access")
    .select(
      "id, person_id, organization_id, access_code, access_token, is_active, expires_at, last_authenticated_at",
    )
    .eq("person_id", parsed.data)
    .eq("organization_id", actor.membership.organization.id)
    .maybeSingle();
  if (error || !data) return { error: "not_found" };
  const access = asAccess(data);
  if (!access || !access.is_active) return { error: "not_found" };

  const invited = await sendInvite({
    personId: parsed.data,
    locale,
    access,
  });
  if (invited.error) return { error: invited.error };

  void recordAuditEvent({
    organizationId: access.organization_id,
    actorUserId: actor.user.id,
    actorKind: "staff",
    action: "portal.invite_resend",
    resourceType: "person",
    resourceId: parsed.data,
  }).catch((err) => console.error("portal staff audit:", err));

  revalidatePath(`/${locale}/people/${parsed.data}`);
  return {
    message: "invited",
    accessCode: access.access_code,
    portalUrl: invited.portalUrl,
  };
}

export async function resetPersonPortalAction(
  _prev: PortalStaffActionState,
  formData: FormData,
): Promise<PortalStaffActionState> {
  const parsed = uuid.safeParse(String(formData.get("personId") || ""));
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  if (!parsed.success) return { error: "invalid" };

  const actor = await requireStaffActor();
  if ("error" in actor) return { error: actor.error };

  const admin = createServiceClient();
  const { data, error } = await admin.rpc("staff_reset_customer_portal", {
    p_person_id: parsed.data,
    p_actor_user_id: actor.user.id,
  });
  if (error) {
    console.error("staff_reset_customer_portal:", error.message);
    return { error: "reset_failed" };
  }
  const access = asAccess(data);
  if (!access) return { error: "reset_failed" };

  void recordAuditEvent({
    organizationId: access.organization_id,
    actorUserId: actor.user.id,
    actorKind: "staff",
    action: "portal.password_reset",
    resourceType: "person",
    resourceId: parsed.data,
  }).catch((err) => console.error("portal staff audit:", err));

  const invited = await sendInvite({
    personId: parsed.data,
    locale,
    access,
    reset: true,
  });
  const base = await getAppBaseUrl();
  const url = portalUrl(base, locale, access.access_token);
  revalidatePath(`/${locale}/people/${parsed.data}`);

  if (invited.error && invited.error !== "no_email") {
    return {
      error: invited.error,
      accessCode: access.access_code,
      portalUrl: url,
    };
  }
  return {
    message: invited.error === "no_email" ? "reset" : "reset_invited",
    accessCode: access.access_code,
    portalUrl: invited.portalUrl ?? url,
  };
}
