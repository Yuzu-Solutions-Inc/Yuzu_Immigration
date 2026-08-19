"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { isChildParticipantRole } from "@/lib/crm/programs";
import { getPerson, getProject, getProjectParticipants } from "@/lib/crm/queries";
import { sendPortalInviteEmail } from "@/lib/email/portal-invite";
import { toAppLocale } from "@/lib/i18n/locales";
import { portalBaseUrl, type PortalAccessRow } from "@/lib/portal/auth";
import { recordAuditEvent } from "@/lib/security/audit";
import { createServiceClient } from "@/lib/supabase/admin";

import type {
  PortalProjectActionState,
  PortalStaffActionState,
} from "./portal-state";

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
    google_sub: (row.google_sub as string | null) ?? null,
    legal_accepted_at: (row.legal_accepted_at as string | null) ?? null,
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
  organizationId: string;
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
    .eq("id", input.organizationId)
    .maybeSingle();

  const base = await getAppBaseUrl();
  const locale = toAppLocale(person.preferred_locale || input.locale);
  const url = portalBaseUrl(base, locale);
  const result = await sendPortalInviteEmail({
    locale,
    to: email,
    clientName: `${person.first_name} ${person.last_name}`.trim() || email,
    organizationName: String(org?.name ?? ""),
    organizationId: input.organizationId,
    personId: input.personId,
    portalUrl: url,
    reset: input.reset,
  });
  if (!result.sent) return { error: "email_not_configured" as const };
  return { portalUrl: url };
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

  revalidatePath(`/${locale}/clients/${parsed.data}`);
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

  const person = await getPerson(parsed.data);
  if (!person) return { error: "not_found" };

  const invited = await sendInvite({
    personId: parsed.data,
    locale,
    organizationId: actor.membership.organization.id,
  });
  if (invited.error) return { error: invited.error };

  void recordAuditEvent({
    organizationId: actor.membership.organization.id,
    actorUserId: actor.user.id,
    actorKind: "staff",
    action: "portal.invite_resend",
    resourceType: "person",
    resourceId: parsed.data,
  }).catch((err) => console.error("portal staff audit:", err));

  revalidatePath(`/${locale}/clients/${parsed.data}`);
  return {
    message: "invited",
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
    organizationId: access.organization_id,
    reset: true,
  });
  const base = await getAppBaseUrl();
  const url = portalBaseUrl(base, locale);
  revalidatePath(`/${locale}/clients/${parsed.data}`);

  if (invited.error && invited.error !== "no_email") {
    return {
      error: invited.error,
      portalUrl: url,
    };
  }
  return {
    message: invited.error === "no_email" ? "reset" : "reset_invited",
    portalUrl: invited.portalUrl ?? url,
  };
}

export async function inviteProjectPortalAction(
  _prev: PortalProjectActionState,
  formData: FormData,
): Promise<PortalProjectActionState> {
  const parsed = uuid.safeParse(String(formData.get("projectId") || ""));
  const locale = toAppLocale(String(formData.get("locale") || "en"));
  if (!parsed.success) return { error: "invalid" };

  const actor = await requireStaffActor();
  if ("error" in actor) return { error: actor.error };

  const project = await getProject(parsed.data);
  if (!project) return { error: "not_found" };

  const adults = (await getProjectParticipants(parsed.data)).filter(
    (row) => !isChildParticipantRole(row.role),
  );
  const recipients = adults.filter((row) => Boolean(row.person?.email?.trim()));
  if (adults.length === 0) return { error: "none_to_invite" };
  if (recipients.length === 0) return { error: "no_email" };

  const base = await getAppBaseUrl();
  const url = portalBaseUrl(base, locale);
  let invited = 0;
  const skippedNoEmail = adults.length - recipients.length;
  let emailConfigured = true;

  for (const row of recipients) {
    if (!emailConfigured) {
      continue;
    }

    const sent = await sendInvite({
      personId: row.person_id,
      locale,
      organizationId: actor.membership.organization.id,
    });
    if (sent.error === "email_not_configured") {
      emailConfigured = false;
    } else if (sent.error) {
      return {
        error: sent.error,
        portalUrl: url,
        invited,
        skippedNoEmail,
      };
    } else {
      invited += 1;
      void recordAuditEvent({
        organizationId: actor.membership.organization.id,
        actorUserId: actor.user.id,
        actorKind: "staff",
        action: "portal.invite_resend",
        resourceType: "person",
        resourceId: row.person_id,
        metadata: { projectId: parsed.data, source: "project_invite" },
      }).catch((err) => console.error("portal staff audit:", err));
    }
  }

  revalidatePath(`/${locale}/projects/${parsed.data}`);

  if (!emailConfigured && invited === 0) {
    return {
      error: "email_not_configured",
      portalUrl: url,
      invited,
      skippedNoEmail,
    };
  }

  if (invited === 0) {
    return {
      error: "no_email",
      portalUrl: url,
      invited,
      skippedNoEmail,
    };
  }

  return {
    message: skippedNoEmail > 0 ? "invited_partial" : "invited",
    portalUrl: url,
    invited,
    skippedNoEmail,
  };
}
