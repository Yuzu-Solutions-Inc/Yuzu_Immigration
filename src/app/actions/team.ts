"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import {
  canAdministerOrg,
  canShareProjects,
} from "@/lib/auth/rbac";
import {
  INVITE_TTL_DAYS,
  hashInviteToken,
  newInviteToken,
  normalizeInviteEmail,
} from "@/lib/auth/invitations";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { recordAuditEvent } from "@/lib/security/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type TeamActionState = {
  error?: string;
  message?: string;
  inviteUrl?: string;
};

const roleSchema = z.enum(["admin", "consultant", "assistant"]);

export async function inviteOrgMemberAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      email: z.string().email(),
      role: roleSchema,
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      email: String(formData.get("email") || ""),
      role: String(formData.get("role") || ""),
    });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const membership = await getPrimaryMembership();
  if (!membership || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }

  const user = await getSessionUser();
  const email = normalizeInviteEmail(parsed.data.email);
  const orgId = membership.organization.id;

  const supabase = await createClient();
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

  const admin = createServiceClient();
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
      role: parsed.data.role,
      token_hash: hashInviteToken(token),
      invited_by: user?.id ?? null,
      expires_at: expiresAt,
    });

  if (insertError) {
    console.error("invite insert:", insertError.message);
    return { error: "invite_failed" };
  }

  const base = await getAppBaseUrl();
  const locale = parsed.data.locale;
  const invitePath = `/${locale}/invite/${token}`;
  const inviteUrl = `${base}${invitePath}`;
  const redirectTo = `${base}/auth/callback?next=${encodeURIComponent(invitePath)}`;

  const { error: authError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
  });

  if (authError) {
    console.error("inviteUserByEmail:", authError.message);
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "member.invite",
    resourceType: "organization_invitation",
    metadata: { email, role: parsed.data.role, authInvited: !authError },
  });

  revalidatePath(`/${locale}/settings/organization`);
  return {
    message: authError ? "invite_link" : "invited",
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

  revalidatePath(`/${parsed.data.locale}/settings/organization`);
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
      role: roleSchema,
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      memberId: String(formData.get("memberId") || ""),
      role: String(formData.get("role") || ""),
    });

  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  if (!membership || !canAdministerOrg(membership.role)) {
    return { error: "forbidden" };
  }

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("organization_members")
    .select("id, user_id, role")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();

  if (!target) return { error: "not_found" };

  if (target.role === "admin" && parsed.data.role !== "admin") {
    const { count } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization.id)
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return { error: "last_admin" };
    }
  }

  const { error } = await supabase
    .from("organization_members")
    .update({ role: parsed.data.role })
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id);

  if (error) {
    console.error("update member role:", error.message);
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
    metadata: { role: parsed.data.role },
  });

  revalidatePath(`/${parsed.data.locale}/settings/organization`);
  return { message: "role_updated" };
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

  const supabase = await createClient();
  const { data: target } = await supabase
    .from("organization_members")
    .select("id, user_id, role")
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id)
    .maybeSingle();

  if (!target) return { error: "not_found" };
  if (target.user_id === user.id) {
    return { error: "cannot_remove_self" };
  }
  if (target.role === "admin") {
    const { count } = await supabase
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", membership.organization.id)
      .eq("role", "admin");
    if ((count ?? 0) <= 1) {
      return { error: "last_admin" };
    }
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", parsed.data.memberId)
    .eq("organization_id", membership.organization.id);

  if (error) {
    console.error("remove member:", error.message);
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

  revalidatePath(`/${parsed.data.locale}/settings/organization`);
  return { message: "removed" };
}

export async function setProjectAssistantAccessAction(
  _prev: TeamActionState,
  formData: FormData,
): Promise<TeamActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      projectId: z.string().uuid(),
      userIds: z.array(z.string().uuid()),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      projectId: String(formData.get("projectId") || ""),
      userIds: formData.getAll("userId").map(String),
    });

  if (!parsed.success) return { error: "invalid" };

  const membership = await getPrimaryMembership();
  if (!membership || !canShareProjects(membership.role)) {
    return { error: "forbidden" };
  }

  const orgId = membership.organization.id;
  const supabase = await createClient();
  const { data: project } = await supabase
    .from("immigration_projects")
    .select("id")
    .eq("id", parsed.data.projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (!project) return { error: "not_found" };

  const { data: assistants } = await supabase
    .from("organization_members")
    .select("user_id")
    .eq("organization_id", orgId)
    .eq("role", "assistant");

  const allowed = new Set((assistants ?? []).map((a) => a.user_id as string));
  const nextIds = parsed.data.userIds.filter((id) => allowed.has(id));

  const { data: existing } = await supabase
    .from("project_staff_access")
    .select("id, user_id")
    .eq("project_id", parsed.data.projectId)
    .eq("organization_id", orgId);

  const existingIds = new Set((existing ?? []).map((r) => r.user_id as string));
  const nextSet = new Set(nextIds);

  const toRemove = (existing ?? []).filter(
    (row) => !nextSet.has(row.user_id as string),
  );
  const toAdd = nextIds.filter((id) => !existingIds.has(id));

  if (toRemove.length > 0) {
    await supabase
      .from("project_staff_access")
      .delete()
      .in(
        "id",
        toRemove.map((r) => r.id as string),
      );
  }

  const user = await getSessionUser();
  if (toAdd.length > 0) {
    const { error } = await supabase.from("project_staff_access").insert(
      toAdd.map((userId) => ({
        organization_id: orgId,
        project_id: parsed.data.projectId,
        user_id: userId,
        granted_by: user?.id ?? null,
      })),
    );
    if (error) {
      console.error("share project:", error.message);
      return { error: "save_failed" };
    }
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "project.share_assistants",
    resourceType: "immigration_project",
    resourceId: parsed.data.projectId,
    metadata: { userIds: nextIds },
  });

  revalidatePath(`/${parsed.data.locale}/projects/${parsed.data.projectId}`);
  return { message: "shared" };
}
