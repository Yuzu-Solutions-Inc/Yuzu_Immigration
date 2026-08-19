import { createHash, randomBytes } from "node:crypto";

import type { OrgRole } from "@/lib/auth/rbac";
import { DEFAULT_ORG_ROLE, isOrgRole } from "@/lib/auth/rbac";
import { getSessionUser } from "@/lib/auth/session";
import { hasAcceptedLegal } from "@/lib/legal/acceptance";
import { createServiceClient } from "@/lib/supabase/admin";

export const INVITE_TTL_DAYS = 14;

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newInviteToken() {
  return randomBytes(32).toString("base64url");
}

export function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

type InvitationRow = {
  id: string;
  organization_id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
};

function isPending(row: InvitationRow, now = Date.now()) {
  if (row.accepted_at || row.revoked_at) return false;
  return new Date(row.expires_at).getTime() > now;
}

async function addMembership(input: {
  organizationId: string;
  userId: string;
  role: OrgRole;
}) {
  const admin = createServiceClient();
  const { error } = await admin.from("organization_members").upsert(
    {
      organization_id: input.organizationId,
      user_id: input.userId,
      role: isOrgRole(input.role) ? input.role : DEFAULT_ORG_ROLE,
    },
    { onConflict: "organization_id,user_id", ignoreDuplicates: true },
  );
  if (error) {
    console.error("addMembership:", error.message);
    throw new Error("join_failed");
  }
}

export async function acceptInvitationByToken(
  token: string,
): Promise<{ ok: true; organizationId: string } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user?.email) {
    return { ok: false, error: "unauthorized" };
  }
  if (!hasAcceptedLegal(user)) {
    return { ok: false, error: "legal_required" };
  }

  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organization_invitations")
    .select(
      "id, organization_id, email, role, expires_at, accepted_at, revoked_at",
    )
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (error || !data) {
    return { ok: false, error: "invalid" };
  }

  const row = data as InvitationRow;
  if (!isPending(row)) {
    return { ok: false, error: row.accepted_at ? "already_accepted" : "expired" };
  }

  if (normalizeInviteEmail(row.email) !== normalizeInviteEmail(user.email)) {
    return { ok: false, error: "email_mismatch" };
  }

  try {
    await addMembership({
      organizationId: row.organization_id,
      userId: user.id,
      role: row.role,
    });
  } catch {
    return { ok: false, error: "join_failed" };
  }

  await admin
    .from("organization_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_user_id: user.id,
    })
    .eq("id", row.id);

  return { ok: true, organizationId: row.organization_id };
}

/** Join any pending invites for the signed-in user's email. */
export async function acceptPendingInvitationsForUser(): Promise<number> {
  const user = await getSessionUser();
  if (!user?.email || !hasAcceptedLegal(user)) return 0;

  const admin = createServiceClient();
  const email = normalizeInviteEmail(user.email);
  const { data, error } = await admin
    .from("organization_invitations")
    .select(
      "id, organization_id, email, role, expires_at, accepted_at, revoked_at",
    )
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());

  if (error) {
    console.error("acceptPendingInvitationsForUser:", error.message);
    return 0;
  }

  const matches = ((data ?? []) as InvitationRow[]).filter(
    (row) => normalizeInviteEmail(row.email) === email && isPending(row),
  );

  let joined = 0;
  for (const row of matches) {
    try {
      await addMembership({
        organizationId: row.organization_id,
        userId: user.id,
        role: row.role,
      });
      await admin
        .from("organization_invitations")
        .update({
          accepted_at: new Date().toISOString(),
          accepted_user_id: user.id,
        })
        .eq("id", row.id);
      joined += 1;
    } catch (err) {
      console.error("acceptPendingInvitationsForUser join:", err);
    }
  }

  return joined;
}

export async function getInvitationByToken(token: string) {
  const admin = createServiceClient();
  const { data } = await admin
    .from("organization_invitations")
    .select(
      "id, organization_id, email, role, expires_at, accepted_at, revoked_at",
    )
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (!data) return null;
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", data.organization_id)
    .maybeSingle();

  return {
    ...(data as InvitationRow),
    role: isOrgRole(data.role) ? data.role : DEFAULT_ORG_ROLE,
    organizationName: (org?.name as string | undefined) ?? null,
  };
}
