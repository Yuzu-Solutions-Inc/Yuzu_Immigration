import {
  formatImmCode,
  getFormVersionRows,
} from "@/lib/ircc/form-directory";
import { requireOrganizationId } from "@/lib/crm/queries";
import { getSessionUser } from "@/lib/auth/session";
import { notifyFormCertification } from "@/lib/notifications/emit";
import { createClient } from "@/lib/supabase/server";

export type StaffNotificationRow = {
  id: string;
  organization_id: string;
  user_id: string;
  project_id: string | null;
  kind: "documents_uploaded" | "forms_complete" | "form_certification" | "inbound_email";
  title: string;
  body: string | null;
  href: string | null;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

function changedFormCodes(): string[] {
  return getFormVersionRows()
    .filter((row) => {
      if (row.validation === "failed") return true;
      if (
        row.livePublished &&
        row.published &&
        row.livePublished !== row.published
      ) {
        return true;
      }
      return false;
    })
    .map((row) => formatImmCode(row.code));
}

async function ensureWeeklyFormCertificationNotification(
  organizationId: string,
  userId: string,
): Promise<void> {
  const codes = changedFormCodes();
  if (codes.length === 0) return;

  const supabase = await createClient();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabase
    .from("staff_notifications")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("kind", "form_certification")
    .gte("created_at", weekAgo)
    .limit(1)
    .maybeSingle();

  if (recent?.id) return;

  await notifyFormCertification({
    organizationId,
    userIds: [userId],
    changedFormCodes: codes,
  });
}

export async function listStaffNotifications(
  limit = 30,
): Promise<StaffNotificationRow[]> {
  const user = await getSessionUser();
  const orgId = await requireOrganizationId();
  if (!user || !orgId) return [];

  await ensureWeeklyFormCertificationNotification(orgId, user.id);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("staff_notifications")
    .select(
      "id, organization_id, user_id, project_id, kind, title, body, href, metadata, read_at, created_at",
    )
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("listStaffNotifications:", error.message);
    return [];
  }

  return (data ?? []) as StaffNotificationRow[];
}

export async function markStaffNotificationsRead(
  ids: string[],
): Promise<boolean> {
  const user = await getSessionUser();
  const orgId = await requireOrganizationId();
  if (!user || !orgId || ids.length === 0) return false;

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .in("id", ids)
    .is("read_at", null);

  if (error) {
    console.error("markStaffNotificationsRead:", error.message);
    return false;
  }
  return true;
}

export async function markAllStaffNotificationsRead(): Promise<boolean> {
  const user = await getSessionUser();
  const orgId = await requireOrganizationId();
  if (!user || !orgId) return false;

  const supabase = await createClient();
  const { error } = await supabase
    .from("staff_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .is("read_at", null);

  if (error) {
    console.error("markAllStaffNotificationsRead:", error.message);
    return false;
  }
  return true;
}
