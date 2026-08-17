"use server";

import { z } from "zod";

import { sendPortalDeletionRequestEmail } from "@/lib/email/portal-deletion-request";
import { getPortalSession } from "@/lib/portal/auth";
import { CLOSED_FILE_RETENTION_YEARS } from "@/lib/privacy/retention";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  decryptPersonRow,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type PortalDeletionState = {
  error?: string;
  success?: boolean;
};

const deletionSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function requestPortalDeletionAction(
  _prev: PortalDeletionState,
  formData: FormData,
): Promise<PortalDeletionState> {
  const parsed = deletionSchema.safeParse({
    locale: formData.get("locale") || "en",
    note: String(formData.get("note") || ""),
  });
  if (!parsed.success) return { error: "invalid" };

  const session = await getPortalSession();
  if (!session) return { error: "unauthorized" };

  const admin = createServiceClient();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await admin
    .from("security_audit_events")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", session.organizationId)
    .eq("action", "portal.deletion_request")
    .eq("resource_id", session.personId)
    .gte("created_at", since);

  if ((count ?? 0) > 0) {
    return { error: "already_requested" };
  }

  const key = await getOrgDataKey(session.organizationId);
  const [{ data: org }, { data: personRow }, { data: links }] =
    await Promise.all([
      admin
        .from("organizations")
        .select("name, privacy_contact_email")
        .eq("id", session.organizationId)
        .maybeSingle(),
      admin
        .from("people")
        .select("first_name, last_name, email")
        .eq("id", session.personId)
        .eq("organization_id", session.organizationId)
        .maybeSingle(),
      admin
        .from("project_participants")
        .select("project_id")
        .eq("person_id", session.personId)
        .eq("organization_id", session.organizationId)
        .is("left_at", null),
    ]);

  const contact = org?.privacy_contact_email?.trim().toLowerCase();
  if (!contact) return { error: "no_firm_contact" };
  if (!personRow) return { error: "not_found" };

  const person = decryptPersonRow(personRow, key);
  const projectIds = [
    ...new Set((links ?? []).map((row) => row.project_id as string)),
  ];
  const { data: projects } =
    projectIds.length > 0
      ? await admin
          .from("immigration_projects")
          .select("title, destroyed_at")
          .eq("organization_id", session.organizationId)
          .in("id", projectIds)
      : { data: [] as Array<{ title: string; destroyed_at: string | null }> };

  const projectTitles = (
    (projects ?? []) as Array<{ title: string; destroyed_at: string | null }>
  )
    .filter((row) => !row.destroyed_at)
    .map((row) => decryptProjectRow(row, key).title);

  const sent = await sendPortalDeletionRequestEmail({
    locale: parsed.data.locale,
    to: contact,
    organizationName: String(org?.name ?? ""),
    clientName: `${person.first_name} ${person.last_name}`.trim(),
    clientEmail: person.email,
    personId: session.personId,
    note: parsed.data.note || null,
    projectTitles,
  });

  if (!sent.sent) {
    return {
      error:
        sent.reason === "not_configured"
          ? "email_not_configured"
          : "send_failed",
    };
  }

  await recordAuditEvent({
    organizationId: session.organizationId,
    actorKind: "portal",
    action: "portal.deletion_request",
    resourceType: "person",
    resourceId: session.personId,
    metadata: {
      years: CLOSED_FILE_RETENTION_YEARS,
      projectCount: projectTitles.length,
    },
  });

  return { success: true };
}
