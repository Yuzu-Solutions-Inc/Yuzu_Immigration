"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canAdministerOrg } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { requireOrganizationId } from "@/lib/crm/queries";
import { eraseProjectPersonalData } from "@/lib/privacy/erase";
import { isEligibleForDestruction } from "@/lib/privacy/retention";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  decryptDocumentFileRow,
  decryptNoteBody,
  decryptPersonRow,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
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
  const key = await getOrgDataKey(orgId);
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("*")
    .eq("id", personId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (personError || !person) {
    return { error: "not_found" };
  }

  const decryptedPerson = decryptPersonRow(
    person as {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    },
    key,
  );

  const [{ data: notes }, { data: participants }, { data: docFiles }] =
    await Promise.all([
      supabase
        .from("person_notes")
        .select("id, body, appointment_id, occurred_at, status, created_at, updated_at")
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
    person: decryptedPerson,
    notes: (notes ?? []).map((note) => ({
      ...note,
      body: decryptNoteBody(note.body as string, key),
    })),
    projectParticipations: participants ?? [],
    projects: (projects ?? []).map((project) =>
      decryptProjectRow(
        project as {
          title: string;
          description?: string | null;
          notes?: string | null;
        },
        key,
      ),
    ),
    documents: (docFiles ?? []).map((f) => ({
      ...decryptDocumentFileRow(
        f as { original_filename: string },
        key,
      ),
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
  const safeName = `${decryptedPerson.last_name}_${decryptedPerson.first_name}`
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
  const key = await getOrgDataKey(orgId);
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

  const decryptedProject = decryptProjectRow(
    project as { title: string; description?: string | null; notes?: string | null },
    key,
  );

  const admin = createServiceClient();
  const { data: principalRows } = await admin
    .from("project_participants")
    .select("person_id")
    .eq("project_id", project.id)
    .eq("organization_id", orgId)
    .eq("role", "principal")
    .is("left_at", null)
    .limit(1);

  let clientName = decryptedProject.title;
  const principalPersonId = principalRows?.[0]?.person_id as string | undefined;
  if (principalPersonId) {
    const { data: person } = await admin
      .from("people")
      .select("first_name, last_name")
      .eq("id", principalPersonId)
      .maybeSingle();
    if (person) {
      const decrypted = decryptPersonRow(
        person as { first_name: string; last_name: string },
        key,
      );
      clientName =
        `${decrypted.first_name ?? ""} ${decrypted.last_name ?? ""}`.trim() ||
        clientName;
    }
  }

  try {
    const summary = await eraseProjectPersonalData({
      organizationId: orgId,
      projectId: project.id as string,
      actorUserId: user?.id ?? null,
      keepProjectRow: true,
      clientName,
      serviceSummary: `${project.program_family} — ${decryptedProject.title}`,
      fileClosedAt: project.closed_at as string | null,
      destructionNote: parsed.data.note || null,
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorUserId: user?.id,
      actorKind: "staff",
      action: "project.destroy",
      resourceType: "immigration_project",
      resourceId: project.id as string,
      metadata: {
        documentsRemoved: summary.documentsRemoved,
        peopleErased: summary.peopleErased,
        appointmentsRemoved: summary.appointmentsRemoved,
      },
    });
  } catch (error) {
    console.error("destroy project:", error);
    return { error: "destroy_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/projects/${project.id}`);
  revalidatePath(`/${parsed.data.locale}/projects`);
  revalidatePath(`/${parsed.data.locale}/people`);
  revalidatePath(`/${parsed.data.locale}/calendar`);
  revalidatePath(`/${parsed.data.locale}/settings/security`);
  return { message: "destroyed" };
}
