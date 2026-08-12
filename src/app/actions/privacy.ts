"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/crm/queries";
import { CLIENT_DOCUMENTS_BUCKET } from "@/lib/documents/catalog";
import { isEligibleForDestruction } from "@/lib/privacy/retention";
import { recordAuditEvent } from "@/lib/security/audit";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type PrivacyActionState = {
  error?: string;
  message?: string;
  exportBase64?: string;
  exportFilename?: string;
};

export async function exportPersonDataAction(
  personId: string,
): Promise<PrivacyActionState> {
  if (!z.string().uuid().safeParse(personId).success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const membership = await getPrimaryMembership();
  if (!canAdministerOrg(membership?.role)) {
    return { error: "forbidden" };
  }

  const supabase = await createClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("*")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (personError || !person) {
    return { error: "not_found" };
  }

  const [{ data: notes }, { data: participants }, { data: docFiles }] =
    await Promise.all([
      supabase
        .from("person_notes")
        .select("id, body, created_at, updated_at")
        .eq("person_id", personId)
        .eq("organization_id", orgId)
        .order("created_at", { ascending: true }),
      supabase
        .from("project_participants")
        .select("id, role, left_at, project_id, created_at")
        .eq("person_id", personId)
        .eq("organization_id", orgId),
      supabase
        .from("project_document_files")
        .select(
          "id, project_id, original_filename, content_type, byte_size, created_at, encryption_alg",
        )
        .eq("person_id", personId)
        .eq("organization_id", orgId),
    ]);

  const projectIds = [
    ...new Set((participants ?? []).map((p) => p.project_id as string)),
  ];
  const { data: projects } =
    projectIds.length > 0
      ? await supabase
          .from("immigration_projects")
          .select(
            "id, title, status, program_family, closed_at, retain_until, destroyed_at, opened_at",
          )
          .eq("organization_id", orgId)
          .in("id", projectIds)
      : { data: [] };

  const payload = {
    exportedAt: new Date().toISOString(),
    organizationId: orgId,
    person,
    notes: notes ?? [],
    projectParticipations: participants ?? [],
    projects: projects ?? [],
    documents: (docFiles ?? []).map((f) => ({
      ...f,
      note: "Document ciphertext is stored encrypted; content omitted from this export metadata package.",
    })),
  };

  const user = await getSessionUser();
  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "person.export",
    resourceType: "person",
    resourceId: personId,
  });

  const json = JSON.stringify(payload, null, 2);
  const safeName = `${person.last_name}_${person.first_name}`
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80);

  return {
    message: "exported",
    exportBase64: Buffer.from(json, "utf8").toString("base64"),
    exportFilename: `person-export-${safeName}-${personId.slice(0, 8)}.json`,
  };
}

export async function destroyClosedProjectAction(
  _prev: PrivacyActionState,
  formData: FormData,
): Promise<PrivacyActionState> {
  const parsed = z
    .object({
      locale: z.enum(["en", "fr", "es"]).default("en"),
      projectId: z.string().uuid(),
      confirmation: z.literal("DESTROY"),
      note: z.string().trim().max(500).optional().or(z.literal("")),
    })
    .safeParse({
      locale: formData.get("locale") || "en",
      projectId: String(formData.get("projectId") || ""),
      confirmation: String(formData.get("confirmation") || ""),
      note: String(formData.get("note") || ""),
    });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const membership = await getPrimaryMembership();
  if (!canAdministerOrg(membership?.role)) {
    return { error: "forbidden" };
  }

  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: project, error } = await supabase
    .from("immigration_projects")
    .select(
      "id, title, program_family, closed_at, retain_until, destroyed_at, organization_id",
    )
    .eq("id", parsed.data.projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (error || !project) {
    return { error: "not_found" };
  }

  if (
    !isEligibleForDestruction({
      closedAt: project.closed_at as string | null,
      retainUntil: project.retain_until as string | null,
      destroyedAt: project.destroyed_at as string | null,
    })
  ) {
    return { error: "not_eligible" };
  }

  const admin = createServiceClient();

  const { data: files } = await admin
    .from("project_document_files")
    .select("id, storage_path")
    .eq("project_id", project.id)
    .eq("organization_id", orgId);

  const paths = (files ?? []).map((f) => f.storage_path as string);
  if (paths.length > 0) {
    const { error: storageError } = await admin.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .remove(paths);
    if (storageError) {
      console.error("destroy storage:", storageError.message);
      return { error: "destroy_failed" };
    }
  }

  await admin
    .from("project_document_files")
    .delete()
    .eq("project_id", project.id)
    .eq("organization_id", orgId);

  await admin
    .from("project_form_answers")
    .update({
      answers: {},
      current_section: null,
      updated_at: new Date().toISOString(),
    })
    .eq("project_id", project.id)
    .eq("organization_id", orgId);

  await admin
    .from("form_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("project_id", project.id)
    .eq("organization_id", orgId)
    .is("revoked_at", null);

  const { data: principalRows } = await admin
    .from("project_participants")
    .select("person_id")
    .eq("project_id", project.id)
    .eq("organization_id", orgId)
    .eq("role", "principal")
    .is("left_at", null)
    .limit(1);

  let clientName = project.title as string;
  const principalPersonId = principalRows?.[0]?.person_id as string | undefined;
  if (principalPersonId) {
    const { data: person } = await admin
      .from("people")
      .select("first_name, last_name")
      .eq("id", principalPersonId)
      .maybeSingle();
    if (person) {
      clientName =
        `${person.first_name ?? ""} ${person.last_name ?? ""}`.trim() ||
        clientName;
    }
  }

  const destroyedAt = new Date().toISOString();

  await admin.from("file_destruction_register").insert({
    organization_id: orgId,
    project_id: project.id,
    client_name: clientName || "Unknown",
    service_summary: `${project.program_family} — ${project.title}`,
    file_closed_at: project.closed_at,
    destroyed_at: destroyedAt,
    destroyed_by: user?.id ?? null,
  });

  const { error: markError } = await admin
    .from("immigration_projects")
    .update({
      description: null,
      notes: null,
      destroyed_at: destroyedAt,
      destroyed_by: user?.id ?? null,
      destruction_note: parsed.data.note || null,
      updated_at: destroyedAt,
    })
    .eq("id", project.id)
    .eq("organization_id", orgId);

  if (markError) {
    console.error("mark destroyed:", markError.message);
    return { error: "destroy_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "project.destroy",
    resourceType: "immigration_project",
    resourceId: project.id as string,
    metadata: { documentsRemoved: paths.length },
  });

  revalidatePath(`/${parsed.data.locale}/projects/${project.id}`);
  revalidatePath(`/${parsed.data.locale}/projects`);
  revalidatePath(`/${parsed.data.locale}/settings/security`);
  return { message: "destroyed" };
}
