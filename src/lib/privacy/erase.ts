import { hashBookingSubject, normalizeGuestEmail } from "@/lib/booking/abuse";
import { CLIENT_DOCUMENTS_BUCKET } from "@/lib/documents/catalog";
import {
  normalizeAnswersStore,
  stripPersonFromAnswersStore,
} from "@/lib/ircc/answers-store";
import {
  decryptAnswersValue,
  decryptPersonRow,
  encryptAnswersValue,
  encryptDestructionWrite,
  encryptProjectWrite,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

const STORAGE_REMOVE_CHUNK = 100;
const STORAGE_LIST_PAGE = 1000;
const DESTROYED_PROJECT_TITLE = "Destroyed file";

type AdminClient = ReturnType<typeof createServiceClient>;

export type EraseSummary = {
  documentsRemoved: number;
  appointmentsRemoved: number;
  peopleErased: number;
};

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

async function removeStoragePaths(admin: AdminClient, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  for (const group of chunk(unique, STORAGE_REMOVE_CHUNK)) {
    const { error } = await admin.storage
      .from(CLIENT_DOCUMENTS_BUCKET)
      .remove(group);
    if (error) {
      console.error("erase storage:", error.message);
      throw new Error("destroy_failed");
    }
  }
}

async function listStorageUnderPrefix(
  admin: AdminClient,
  prefix: string,
): Promise<string[]> {
  const paths: string[] = [];
  const queue = [prefix.replace(/\/$/, "")];
  while (queue.length > 0) {
    const current = queue.shift()!;
    let offset = 0;
    for (;;) {
      const { data, error } = await admin.storage
        .from(CLIENT_DOCUMENTS_BUCKET)
        .list(current, { limit: STORAGE_LIST_PAGE, offset });
      if (error) {
        console.error("erase storage list:", error.message);
        break;
      }
      const items = data ?? [];
      for (const item of items) {
        const path = current ? `${current}/${item.name}` : item.name;
        if (!item.id) queue.push(path);
        else paths.push(path);
      }
      if (items.length < STORAGE_LIST_PAGE) break;
      offset += items.length;
    }
  }
  return paths;
}

async function scrubAuditForResource(
  admin: AdminClient,
  organizationId: string,
  resourceId: string,
) {
  const patch = { ip: null, user_agent: null, metadata: {} };
  const { error: byId } = await admin
    .from("security_audit_events")
    .update(patch)
    .eq("organization_id", organizationId)
    .eq("resource_id", resourceId);
  if (byId) console.error("scrub audit:", byId.message);

  const { error: byMeta } = await admin
    .from("security_audit_events")
    .update(patch)
    .eq("organization_id", organizationId)
    .filter("metadata::text", "ilike", `%${resourceId}%`);
  if (byMeta) console.error("scrub audit metadata:", byMeta.message);
}

async function recordDestruction(input: {
  admin: AdminClient;
  organizationId: string;
  projectId?: string | null;
  clientName: string;
  serviceSummary: string;
  fileClosedAt?: string | null;
  destroyedBy: string | null;
}) {
  const key = await getOrgDataKey(input.organizationId);
  const { error } = await input.admin.from("file_destruction_register").insert({
    organization_id: input.organizationId,
    project_id: input.projectId ?? null,
    ...encryptDestructionWrite(
      {
        client_name: input.clientName || "Unknown",
        service_summary: input.serviceSummary,
      },
      key,
    ),
    file_closed_at: input.fileClosedAt ?? null,
    destroyed_at: new Date().toISOString(),
    destroyed_by: input.destroyedBy,
  });
  if (error) console.error("destruction register:", error.message);
}

async function stripPersonFromProjectAnswers(
  admin: AdminClient,
  organizationId: string,
  personId: string,
  projectIds: string[],
) {
  if (projectIds.length === 0) return;
  const key = await getOrgDataKey(organizationId);
  const { data: rows } = await admin
    .from("project_form_answers")
    .select("id, project_id, answers")
    .eq("organization_id", organizationId)
    .in("project_id", projectIds);

  for (const row of rows ?? []) {
    const store = normalizeAnswersStore(
      decryptAnswersValue(row.answers, key),
    );
    const next = stripPersonFromAnswersStore(store, personId);
    const { error } = await admin
      .from("project_form_answers")
      .update({
        answers: encryptAnswersValue(next, key),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("organization_id", organizationId);
    if (error) console.error("strip answers:", error.message);
  }
}

async function erasePersonBookings(
  admin: AdminClient,
  organizationId: string,
  personId: string,
): Promise<number> {
  const { data: rows } = await admin
    .from("booking_appointments")
    .select("id, host_user_id, google_event_id")
    .eq("organization_id", organizationId)
    .eq("person_id", personId);

  const appointments = rows ?? [];
  if (appointments.length === 0) return 0;

  const { deleteAppointmentGoogleEvent } = await import(
    "@/lib/google/calendar"
  );
  for (const row of appointments) {
    if (row.google_event_id && row.host_user_id) {
      await deleteAppointmentGoogleEvent({
        organizationId,
        hostUserId: row.host_user_id as string,
        googleEventId: row.google_event_id as string,
      });
    }
  }

  const ids = appointments.map((row) => row.id as string);
  const { error } = await admin
    .from("booking_appointments")
    .delete()
    .eq("organization_id", organizationId)
    .in("id", ids);
  if (error) {
    console.error("erase bookings:", error.message);
    throw new Error("destroy_failed");
  }
  await Promise.all(
    ids.map((id) => scrubAuditForResource(admin, organizationId, id)),
  );
  return ids.length;
}

async function eraseBookingAbuseForEmail(
  admin: AdminClient,
  organizationId: string,
  email: string | null | undefined,
) {
  const normalized = email ? normalizeGuestEmail(email) : "";
  if (!normalized) return;
  try {
    const emailHash = hashBookingSubject("email", organizationId, normalized);
    const { error } = await admin
      .from("booking_abuse_events")
      .delete()
      .eq("organization_id", organizationId)
      .eq("email_hash", emailHash);
    if (error) console.error("erase booking abuse:", error.message);
  } catch (error) {
    console.error("erase booking abuse:", error);
  }
}

/** Drop generated PDFs that may still contain a removed person’s answers. */
async function clearGeneratedFormPdfs(
  admin: AdminClient,
  organizationId: string,
  projectIds: string[],
) {
  if (projectIds.length === 0) return;
  const { data: forms } = await admin
    .from("project_forms")
    .select("generated_storage_path")
    .eq("organization_id", organizationId)
    .in("project_id", projectIds)
    .not("generated_storage_path", "is", null);
  const paths = (forms ?? [])
    .map((row) => row.generated_storage_path as string | null)
    .filter((path): path is string => Boolean(path));
  await removeStoragePaths(admin, paths);
  if (paths.length === 0) return;
  const { error } = await admin
    .from("project_forms")
    .update({
      generated_storage_path: null,
      generated_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .in("project_id", projectIds)
    .not("generated_storage_path", "is", null);
  if (error) console.error("clear generated forms:", error.message);
}

/**
 * Erase one person’s records at the firm: files, notes, portal, form bags,
 * bookings (and Google events), then the people row.
 */
export async function erasePersonPersonalData(input: {
  organizationId: string;
  personId: string;
  actorUserId: string | null;
  register?: boolean;
}): Promise<EraseSummary> {
  const admin = createServiceClient();
  const { organizationId, personId } = input;

  const { data: person } = await admin
    .from("people")
    .select("id, first_name, last_name, email")
    .eq("id", personId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (!person) {
    return { documentsRemoved: 0, appointmentsRemoved: 0, peopleErased: 0 };
  }

  const key = await getOrgDataKey(organizationId);
  const decrypted = decryptPersonRow(
    person as { first_name: string; last_name: string; email: string | null },
    key,
  );
  const clientName =
    `${decrypted.first_name ?? ""} ${decrypted.last_name ?? ""}`.trim() ||
    "Unknown";

  const [{ data: files }, { data: forms }, { data: participants }] =
    await Promise.all([
      admin
        .from("project_document_files")
        .select("storage_path, project_id")
        .eq("organization_id", organizationId)
        .eq("person_id", personId),
      admin
        .from("project_forms")
        .select("id, project_id, generated_storage_path")
        .eq("organization_id", organizationId)
        .eq("person_id", personId),
      admin
        .from("project_participants")
        .select("project_id")
        .eq("organization_id", organizationId)
        .eq("person_id", personId),
    ]);

  const projectIds = [
    ...new Set(
      [
        ...(files ?? []).map((row) => row.project_id as string),
        ...(forms ?? []).map((row) => row.project_id as string),
        ...(participants ?? []).map((row) => row.project_id as string),
      ].filter(Boolean),
    ),
  ];

  const dbPaths = [
    ...(files ?? []).map((row) => row.storage_path as string),
    ...(forms ?? [])
      .map((row) => row.generated_storage_path as string | null)
      .filter((path): path is string => Boolean(path)),
  ];
  const listed: string[] = [];
  for (const projectId of projectIds) {
    listed.push(
      ...(await listStorageUnderPrefix(
        admin,
        `${organizationId}/${projectId}/${personId}`,
      )),
    );
  }
  await removeStoragePaths(admin, [...dbPaths, ...listed]);

  await admin
    .from("project_document_files")
    .delete()
    .eq("organization_id", organizationId)
    .eq("person_id", personId);
  await admin
    .from("project_document_requests")
    .delete()
    .eq("organization_id", organizationId)
    .eq("person_id", personId);
  await admin
    .from("project_forms")
    .delete()
    .eq("organization_id", organizationId)
    .eq("person_id", personId);
  await admin
    .from("person_notes")
    .delete()
    .eq("organization_id", organizationId)
    .eq("person_id", personId);
  await admin
    .from("customer_portal_access")
    .delete()
    .eq("organization_id", organizationId)
    .eq("person_id", personId);

  await stripPersonFromProjectAnswers(
    admin,
    organizationId,
    personId,
    projectIds,
  );
  await clearGeneratedFormPdfs(admin, organizationId, projectIds);

  const appointmentsRemoved = await erasePersonBookings(
    admin,
    organizationId,
    personId,
  );
  await eraseBookingAbuseForEmail(admin, organizationId, decrypted.email);

  await admin
    .from("project_participants")
    .delete()
    .eq("organization_id", organizationId)
    .eq("person_id", personId);

  await scrubAuditForResource(admin, organizationId, personId);

  if (input.register !== false) {
    await recordDestruction({
      admin,
      organizationId,
      clientName,
      serviceSummary: "Person record erased",
      destroyedBy: input.actorUserId,
    });
  }

  const { error: deleteError } = await admin
    .from("people")
    .delete()
    .eq("id", personId)
    .eq("organization_id", organizationId);
  if (deleteError) {
    console.error("erase person:", deleteError.message);
    throw new Error("destroy_failed");
  }

  return {
    documentsRemoved: dbPaths.length,
    appointmentsRemoved,
    peopleErased: 1,
  };
}

async function eraseOrphanPeople(input: {
  admin: AdminClient;
  organizationId: string;
  personIds: string[];
  actorUserId: string | null;
}): Promise<{ peopleErased: number; appointmentsRemoved: number }> {
  let peopleErased = 0;
  let appointmentsRemoved = 0;
  for (const personId of [...new Set(input.personIds)]) {
    const { count } = await input.admin
      .from("project_participants")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", input.organizationId)
      .eq("person_id", personId);
    if ((count ?? 0) > 0) continue;
    const result = await erasePersonPersonalData({
      organizationId: input.organizationId,
      personId,
      actorUserId: input.actorUserId,
    });
    peopleErased += result.peopleErased;
    appointmentsRemoved += result.appointmentsRemoved;
  }
  return { peopleErased, appointmentsRemoved };
}

/**
 * Erase a project file: storage, documents, answers, share links, forms.
 * Optionally keep a wiped tombstone row (CICC closed-file destruction).
 * People who have no remaining files at the firm are erased too.
 */
export async function eraseProjectPersonalData(input: {
  organizationId: string;
  projectId: string;
  actorUserId: string | null;
  keepProjectRow: boolean;
  clientName?: string;
  serviceSummary?: string;
  fileClosedAt?: string | null;
  destructionNote?: string | null;
}): Promise<EraseSummary> {
  const admin = createServiceClient();
  const { organizationId, projectId } = input;

  const { data: files } = await admin
    .from("project_document_files")
    .select("storage_path")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  const { data: forms } = await admin
    .from("project_forms")
    .select("generated_storage_path")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  const { data: participants } = await admin
    .from("project_participants")
    .select("person_id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);

  const personIds = (participants ?? []).map((row) => row.person_id as string);
  const dbPaths = [
    ...(files ?? []).map((row) => row.storage_path as string),
    ...(forms ?? [])
      .map((row) => row.generated_storage_path as string | null)
      .filter((path): path is string => Boolean(path)),
  ];
  const listed = await listStorageUnderPrefix(
    admin,
    `${organizationId}/${projectId}`,
  );
  await removeStoragePaths(admin, [...dbPaths, ...listed]);

  await admin
    .from("project_document_files")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_document_requests")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("form_share_links")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_form_answers")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_forms")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_staff_access")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_status_history")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_notes")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_booking_invites")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("staff_notifications")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("booking_appointments")
    .update({ project_id: null })
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_participants")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);

  await recordDestruction({
    admin,
    organizationId,
    projectId: input.keepProjectRow ? projectId : null,
    clientName: input.clientName || "Unknown",
    serviceSummary: input.serviceSummary || "Project file erased",
    fileClosedAt: input.fileClosedAt,
    destroyedBy: input.actorUserId,
  });

  await scrubAuditForResource(admin, organizationId, projectId);

  if (input.keepProjectRow) {
    const key = await getOrgDataKey(organizationId);
    const destroyedAt = new Date().toISOString();
    const { error } = await admin
      .from("immigration_projects")
      .update({
        ...encryptProjectWrite(
          {
            title: DESTROYED_PROJECT_TITLE,
            description: null,
            notes: null,
            destruction_note: input.destructionNote || null,
          },
          key,
        ),
        destroyed_at: destroyedAt,
        destroyed_by: input.actorUserId,
        updated_at: destroyedAt,
      })
      .eq("id", projectId)
      .eq("organization_id", organizationId);
    if (error) {
      console.error("tombstone project:", error.message);
      throw new Error("destroy_failed");
    }
  } else {
    const { error } = await admin
      .from("immigration_projects")
      .delete()
      .eq("id", projectId)
      .eq("organization_id", organizationId);
    if (error) {
      console.error("erase project:", error.message);
      throw new Error("destroy_failed");
    }
  }

  const orphans = await eraseOrphanPeople({
    admin,
    organizationId,
    personIds,
    actorUserId: input.actorUserId,
  });

  return {
    documentsRemoved: [...new Set([...dbPaths, ...listed])].length,
    appointmentsRemoved: orphans.appointmentsRemoved,
    peopleErased: orphans.peopleErased,
  };
}
