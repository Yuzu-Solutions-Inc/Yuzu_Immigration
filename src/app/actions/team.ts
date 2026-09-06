"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import {
  canAdministerOrg,
  canTransferOwnership,
  isOwner,
} from "@/lib/auth/rbac";
import {
  INVITE_TTL_DAYS,
  hashInviteToken,
  newInviteToken,
  normalizeInviteEmail,
} from "@/lib/auth/invitations";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { trialExpiredError } from "@/lib/billing/trial";
import { sendOrgInviteEmail } from "@/lib/email/org-invite";
import { orgRoleLabels } from "@/lib/i18n/dictionaries";
import { recordAuditEvent } from "@/lib/security/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type TeamActionState = {
  error?: string;
  message?: string;
  inviteUrl?: string;
};

const accessSchema = z.enum(["admin", "member", "unlicensed"]);

export async function inviteOrgMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      email: z.string().email(),
      access: accessSchema,
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      email: String(formData.get("email") || ""),
      access: String(formData.get("access") || formData.get("role") || ""),
    });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const membership = await getPrimaryMembership();
  if (!membership || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };

  const user = await getSessionUser();
  const email = normalizeInviteEmail(parsed.data.email);
  const orgId = membership.organization.id;

  const supabase = await createClient();
  const admin = createServiceClient();
  const { data: members } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId);

  const memberIds = (members ?? []).map((m) => m.user_id as string);
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email")
      .in("id", memberIds);
    const already = (profiles ?? []).some(
      (p) =>
        p.email && normalizeInviteEmail(p.email as string) === email,
    );
    if (already) {
      return { error: "already_member" };
    }
  }

  await admin
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .ilike("email", email)
    .is("accepted_at", null)
    .is("revoked_at", null);

  const token = newInviteToken();
  const expiresAt = new Date(
    Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error: insertError } = await admin
    .from("organization_invitations")
    .insert({
      organization_id: orgId,
      email,
      role: parsed.data.access === "admin" ? "admin" : "member",
      is_licensed: parsed.data.access !== "unlicensed",
      token_hash: hashInviteToken(token),
      invited_by: user?.id ?? null,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error("invite insert:", insertError.message);
    if (/seats_exceeded/i.test(insertError.message)) {
      return { error: "seats_exceeded" };
    }
    return { error: "invite_failed" };
  }

  const base = await getAppBaseUrl();
  const locale = parsed.data.locale;
  const invitePath = `/${locale}/invite/${token}`;
  const inviteUrl = `${base}${invitePath}`;
  const roleLabels = orgRoleLabels(locale);
  const roleLabel =
    parsed.data.access === "unlicensed"
      ? roleLabels.unlicensed
      : parsed.data.access === "admin"
        ? roleLabels.admin
        : roleLabels.member;

  const sent = await sendOrgInviteEmail({
    locale,
    to: email,
    organizationName: membership.organization.name,
    organizationId: orgId,
    roleLabel,
    inviteUrl,
    invitedByUserId: user?.id ?? null,
  });

  if (!sent.sent) {
    console.error("org invite email:", sent.reason);
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "member.invite",
    resourceType: "organization_invitation",
    metadata: {
      email,
      access: parsed.data.access,
      emailSent: sent.sent,
    },
  });

  revalidatePath(`/${locale}/settings/billing`);
  return {
    message: sent.sent ? "invited" : "invite_link",
    inviteUrl,
  };
}

export async function revokeOrgInvitationAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      invitationId: z.string().uuid(),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      invitationId: String(formData.get("invitationId") || ""),
    });

  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  if (!membership || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };

  const admin = createServiceClient();
  const { error } = await admin
    .from("organization_invitations")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", parsed.data.invitationId)
    .eq("organization_id", membership.organization.id)
    .is("accepted_at", null);

  if (error) {
    console.error("revoke invitation:", error.message);
    return { error: "invite_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/settings/billing`);
  return { message: "revoked" };
}

export async function updateOrgMemberRoleAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      memberId: z.string().uuid(),
      access: accessSchema,
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      memberId: String(formData.get("memberId") || ""),
      access: String(formData.get("access") || formData.get("role") || ""),
    });

  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  if (!membership || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("organization_members")
    .select("id, user_id, role, is_licensed, licensed_at_renewal")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();

  if (!target) return { error: "not_found" };
  if (target.role === "owner") {
    return { error: "last_owner" };
  }

  const { data: org } = await supabase
    .from("organizations")
    .select("billing_pending_seat_quantity")
    .eq("id", membership.organization.id)
    .maybeSingle();
  let licensedAtRenewal: boolean | null = null;
  if (org?.billing_pending_seat_quantity) {
    licensedAtRenewal = parsed.data.access !== "unlicensed";
    if (licensedAtRenewal && target.licensed_at_renewal !== true) {
      const { count } = await supabase
        .from("organization_members")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", membership.organization.id)
        .eq("licensed_at_renewal", true);
      if ((count ?? 0) >= Number(org.billing_pending_seat_quantity)) {
        return { error: "renewal_seats_exceeded" };
      }
    }
  }

  const update =
    parsed.data.access === "unlicensed"
      ? {
          is_licensed: false,
          licensed_at_renewal: licensedAtRenewal,
        }
      : {
          role: parsed.data.access,
          is_licensed: true,
          licensed_at_renewal: licensedAtRenewal,
        };
  const { error } = await supabase
    .from("organization_members")
    .update(update)
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id);

  if (error) {
    console.error("update member role:", error.message);
    if (/seats_exceeded/i.test(error.message)) {
      return { error: "seats_exceeded" };
    }
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      return { error: "last_admin" };
    }
    return { error: "save_failed" };
  }

  const user = await getSessionUser();
  await recordAuditEvent({
    organizationId: membership.organization.id,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "member.role_update",
    resourceType: "organization_member",
    resourceId: parsed.data.memberId,
    metadata: { access: parsed.data.access },
  });

  revalidatePath(`/${parsed.data.locale}/settings/billing`);
  return { message: "role_updated" };
}

export async function updateRenewalLicenseRosterAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      licensedMemberIds: z.array(z.string().uuid()).min(1),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      licensedMemberIds: formData
        .getAll("licensedMemberIds")
        .map((value) => String(value)),
    });
  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  if (!membership || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("stage_org_renewal_licenses", {
    p_organization_id: membership.organization.id,
    p_licensed_member_ids: parsed.data.licensedMemberIds,
  });
  if (error) {
    console.error("update renewal roster:", error.message);
    return {
      error: /invalid_license_roster/i.test(error.message)
        ? "renewal_seats_exceeded"
        : "save_failed",
    };
  }
  await recordAuditEvent({
    organizationId: membership.organization.id,
    actorUserId: (await getSessionUser())?.id,
    actorKind: "staff",
    action: "billing.renewal_roster.update",
    resourceType: "organization",
    resourceId: membership.organization.id,
    metadata: { licensedMemberIds: parsed.data.licensedMemberIds },
  });
  revalidatePath(`/${parsed.data.locale}/settings/billing`);
  return { message: "renewal_roster_updated" };
}

export async function removeOrgMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      memberId: z.string().uuid(),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      memberId: String(formData.get("memberId") || ""),
    });

  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("organization_members")
    .select("id, user_id, role, is_licensed")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();

  if (!target) return { error: "not_found" };
  if (target.user_id === user.id) {
    return { error: "cannot_remove_self" };
  }
  if (isOwner(target.role)) {
    return { error: "last_owner" };
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id);

  if (error) {
    console.error("remove member:", error.message);
    if (error.code === "42501" || /row-level security/i.test(error.message)) {
      return { error: "last_admin" };
    }
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: membership.organization.id,
    actorUserId: user.id,
    actorKind: "staff",
    action: "member.remove",
    resourceType: "organization_member",
    resourceId: parsed.data.memberId,
  });

  revalidatePath(`/${parsed.data.locale}/settings/billing`);
  return { message: "removed" };
}

export async function transferOrgOwnershipAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      memberId: z.string().uuid(),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      memberId: String(formData.get("memberId") || ""),
    });

  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user || !canTransferOwnership(membership.role)) {
    return { error: "forbidden" };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("organization_members")
    .select("id, user_id, role, is_licensed")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();

  if (!target) return { error: "not_found" };
  if (target.user_id === user.id) {
    return { error: "invalid" };
  }
  if (target.is_licensed === false) {
    return { error: "owner_must_be_licensed" };
  }

  const { error } = await supabase.rpc("transfer_organization_ownership", {
    p_organization_id: membership.organization.id,
    p_new_owner_user_id: target.user_id,
  });

  if (error) {
    console.error("transfer ownership:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: membership.organization.id,
    actorUserId: user.id,
    actorKind: "staff",
    action: "organization.transfer_ownership",
    resourceType: "organization_member",
    resourceId: parsed.data.memberId,
    metadata: { newOwnerUserId: target.user_id },
  });

  revalidatePath(`/${parsed.data.locale}/settings/billing`);
  revalidatePath(`/${parsed.data.locale}/settings/organization`);
  return { message: "ownership_transferred" };
}
