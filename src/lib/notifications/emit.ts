import { createServiceClient } from "@/lib/supabase/admin";
import { decryptProjectRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import {
  formPercentForProjectIds,
} from "@/lib/crm/progress";

export type StaffNotificationKind =
  | "documents_uploaded"
  | "forms_complete"
  | "form_certification";

async function recipientUserIds(input: {
  organizationId: string;
  projectId?: string | null;
}): Promise<string[]> {
  const admin = createServiceClient();
  const { data: members, error } = await admin
    .from("organization_members")
    .select("user_id, role")
    .eq("organization_id", input.organizationId);

  if (error) {
    console.error("notification recipients members:", error.message);
    return [];
  }

  const ids = new Set<string>();
  for (const row of members ?? []) {
    const role = row.role as string;
    if (role === "admin" || role === "consultant") {
      ids.add(row.user_id as string);
    }
  }

  if (input.projectId) {
    const { data: access, error: accessError } = await admin
      .from("project_staff_access")
      .select("user_id")
      .eq("project_id", input.projectId)
      .eq("organization_id", input.organizationId);
    if (accessError) {
      console.error("notification recipients access:", accessError.message);
    } else {
      for (const row of access ?? []) {
        ids.add(row.user_id as string);
      }
    }
  }

  return [...ids];
}

async function projectTitle(
  organizationId: string,
  projectId: string,
): Promise<string> {
  const admin = createServiceClient();
  const { data } = await admin
    .from("immigration_projects")
    .select("title")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!data) return "Project";
  const key = await getOrgDataKey(organizationId);
  return decryptProjectRow(data as { title: string }, key).title || "Project";
}

export async function notifyDocumentsUploaded(input: {
  organizationId: string;
  projectId: string;
  fileCount?: number;
}): Promise<void> {
  try {
    const admin = createServiceClient();
    const recipients = await recipientUserIds(input);
    if (recipients.length === 0) return;

    const title = await projectTitle(input.organizationId, input.projectId);
    const addCount = Math.max(1, input.fileCount ?? 1);
    const href = `/projects/${input.projectId}`;

    for (const userId of recipients) {
      const { data: existing } = await admin
        .from("staff_notifications")
        .select("id, metadata")
        .eq("organization_id", input.organizationId)
        .eq("user_id", userId)
        .eq("project_id", input.projectId)
        .eq("kind", "documents_uploaded")
        .is("read_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.id) {
        const meta = (existing.metadata ?? {}) as Record<string, unknown>;
        const prev = typeof meta.fileCount === "number" ? meta.fileCount : 1;
        const fileCount = prev + addCount;
        await admin
          .from("staff_notifications")
          .update({
            title,
            body: `${fileCount} new file${fileCount === 1 ? "" : "s"}`,
            metadata: {
              ...meta,
              projectId: input.projectId,
              projectTitle: title,
              fileCount,
            },
            created_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        continue;
      }

      await admin.from("staff_notifications").insert({
        organization_id: input.organizationId,
        user_id: userId,
        project_id: input.projectId,
        kind: "documents_uploaded",
        title,
        body: `${addCount} new file${addCount === 1 ? "" : "s"}`,
        href,
        metadata: {
          projectId: input.projectId,
          projectTitle: title,
          fileCount: addCount,
        },
      });
    }
  } catch (err) {
    console.error("notifyDocumentsUploaded:", err);
  }
}

export async function maybeNotifyFormsComplete(input: {
  organizationId: string;
  projectId: string;
}): Promise<void> {
  try {
    const progress = await formPercentForProjectIds(
      input.organizationId,
      [input.projectId],
    );
    const percent = progress.get(input.projectId) ?? 0;
    if (percent < 100) return;

    const admin = createServiceClient();
    const { data: recent } = await admin
      .from("staff_notifications")
      .select("id")
      .eq("organization_id", input.organizationId)
      .eq("project_id", input.projectId)
      .eq("kind", "forms_complete")
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .limit(1)
      .maybeSingle();
    if (recent?.id) return;

    const recipients = await recipientUserIds(input);
    if (recipients.length === 0) return;

    const title = await projectTitle(input.organizationId, input.projectId);
    const rows = recipients.map((userId) => ({
      organization_id: input.organizationId,
      user_id: userId,
      project_id: input.projectId,
      kind: "forms_complete" as const,
      title,
      body: "Forms are 100% complete",
      href: `/projects/${input.projectId}/forms`,
      metadata: {
        projectId: input.projectId,
        projectTitle: title,
        formPercent: 100,
      },
    }));
    const { error } = await admin.from("staff_notifications").insert(rows);
    if (error) console.error("maybeNotifyFormsComplete:", error.message);
  } catch (err) {
    console.error("maybeNotifyFormsComplete:", err);
  }
}

export async function notifyFormCertification(input: {
  organizationId: string;
  userIds: string[];
  changedFormCodes: string[];
}): Promise<void> {
  if (input.userIds.length === 0 || input.changedFormCodes.length === 0) {
    return;
  }
  try {
    const admin = createServiceClient();
    const count = input.changedFormCodes.length;
    const rows = input.userIds.map((userId) => ({
      organization_id: input.organizationId,
      user_id: userId,
      project_id: null,
      kind: "form_certification" as const,
      title: "IRCC form updates",
      body: `${count} form${count === 1 ? "" : "s"} changed since the last certification check`,
      href: "/settings/forms",
      metadata: {
        formCodes: input.changedFormCodes,
        count,
      },
    }));
    const { error } = await admin.from("staff_notifications").insert(rows);
    if (error) console.error("notifyFormCertification:", error.message);
  } catch (err) {
    console.error("notifyFormCertification:", err);
  }
}
