import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

export type SeatCap = {
  subscribed: boolean;
  licensed: number;
  members: number;
  pending: number;
  occupancy: number;
};

export async function occupancyCount(orgId: string): Promise<number> {
  const cap = await loadSeatCap(orgId);
  return cap.occupancy;
}

export async function loadSeatCap(orgId: string): Promise<SeatCap> {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const [org, members, pending] = await Promise.all([
    admin
      .from("organizations")
      .select("subscribed_at, billing_seat_quantity")
      .eq("id", orgId)
      .maybeSingle(),
    admin
      .from("organization_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_licensed", true),
    admin
      .from("organization_invitations")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .eq("is_licensed", true)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", now),
  ]);

  const memberCount = members.count ?? 0;
  const pendingCount = pending.count ?? 0;
  return {
    subscribed: Boolean(org.data?.subscribed_at),
    licensed: Math.max(1, org.data?.billing_seat_quantity ?? 1),
    members: memberCount,
    pending: pendingCount,
    occupancy: memberCount + pendingCount,
  };
}

async function pendingInviteForEmail(
  orgId: string,
  email: string,
): Promise<boolean> {
  const admin = createServiceClient();
  const { count } = await admin
    .from("organization_invitations")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .ilike("email", email.trim().toLowerCase())
    .is("accepted_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString());
  return (count ?? 0) > 0;
}

/** New invite needs a free licensed seat. Re-inviting the same email does not. */
export async function canReserveInviteSeat(
  orgId: string,
  email: string,
): Promise<boolean> {
  const cap = await loadSeatCap(orgId);
  if (!cap.subscribed) return true;
  if (await pendingInviteForEmail(orgId, email)) return true;
  return cap.occupancy < cap.licensed;
}

/** A new membership row needs a free licensed seat. */
export async function canAddMemberSeat(orgId: string): Promise<boolean> {
  const cap = await loadSeatCap(orgId);
  if (!cap.subscribed) return true;
  return cap.members < cap.licensed;
}
