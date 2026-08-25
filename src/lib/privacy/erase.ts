import { normalizeGuestEmail } from "@/lib/booking/abuse";
import { hashEmailLookup } from "@/lib/security/email-lookup";
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

async function eraseInboundMail(
  admin: AdminClient,
  organizationId: string,
  filter: { personId: string } | { projectId: string },
) {
  let query = admin
    .from("inbound_messages")
    .select("id")
    .eq("organization_id", organizationId);
  query =
    "personId" in filter
      ? query.eq("person_id", filter.personId)
      : query.eq("project_id", filter.projectId);
  const { data: messages } = await query;
  const messageIds = (messages ?? []).map((row) => row.id as string);
  if (messageIds.length === 0) return;

  const { data: attachments } = await admin
    .from("inbound_attachments")
    .select("storage_path")
    .eq("organization_id", organizationId)
    .in("message_id", messageIds);
  const listed: string[] = [];
  for (const id of messageIds) {
    listed.push(
      ...(await listStorageUnderPrefix(
        admin,
        `${organizationId}/inbound/${id}`,
      )),
    );
  }
  await removeStoragePaths(admin, [
    ...(attachments ?? []).map((row) => row.storage_path as string),
    ...listed,
  ]);
  await admin
    .from("inbound_messages")
    .delete()
    .eq("organization_id", organizationId)
    .in("id", messageIds);
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
    .select("id, host_user_id, google_event_id, microsoft_event_id, conference_id")
    .eq("organization_id", organizationId)
    .eq("person_id", personId);

  const appointments = rows ?? [];
  if (appointments.length === 0) return 0;

  const { deleteAppointmentHostCalendarEvents } = await import(
    "@/lib/calendar/host-calendar"
  );
  for (const row of appointments) {
    if (row.host_user_id && (row.google_event_id || row.microsoft_event_id)) {
      await deleteAppointmentHostCalendarEvents({
        organizationId,
        hostUserId: row.host_user_id as string,
        googleEventId: (row.google_event_id as string | null) ?? null,
        microsoftEventId: (row.microsoft_event_id as string | null) ?? null,
        conferenceId: (row.conference_id as string | null) ?? null,
      });
    }
  }

  const ids = appointments.map((row) => row.id as string);
  const { data: contractFiles } = await admin
    .from("contract_envelopes")
    .select("signed_pdf_storage_path")
    .eq("organization_id", organizationId)
    .in("appointment_id", ids);
  const contractPaths = (contractFiles ?? [])
    .map((row) => row.signed_pdf_storage_path as string | null)
    .filter((path): path is string => Boolean(path));
  if (contractPaths.length > 0) {
    const { CONTRACT_ENVELOPES_BUCKET } = await import(
      "@/lib/contracts/types"
    );
    const { error: storageError } = await admin.storage
      .from(CONTRACT_ENVELOPES_BUCKET)
      .remove(contractPaths);
    if (storageError) {
      console.error("erase contract pdfs:", storageError.message);
    }
  }

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
  orgKey: Buffer,
) {
  const normalized = email ? normalizeGuestEmail(email) : "";
  if (!normalized) return;
  try {
    const { error } = await admin
      .from("booking_abuse_events")
      .delete()
      .eq("organization_id", organizationId)
      .eq("email_hash", hashEmailLookup(organizationId, normalized, orgKey));
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
  await eraseInboundMail(admin, organizationId, { personId });
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
  await eraseBookingAbuseForEmail(
    admin,
    organizationId,
    decrypted.email,
    key,
  );

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
 * Erase a project file: storage, documents, answers, forms.
 * Optionally keep a wiped tombstone row (CICC closed-file destruction).
 * Signed project contracts are retained on the tombstone until the project
 * row itself is deleted — they are excluded from the six-year purge.
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
  const contractsPrefix = `${organizationId}/${projectId}/contracts`;

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

  const isContractArchivePath = (path: string) =>
    path === contractsPrefix || path.startsWith(`${contractsPrefix}/`);

  const storageToRemove = input.keepProjectRow
    ? [...dbPaths, ...listed].filter((path) => !isContractArchivePath(path))
    : [...dbPaths, ...listed];

  await removeStoragePaths(admin, storageToRemove);

  if (input.keepProjectRow) {
    await scrubUnsignedProjectContracts(admin, organizationId, projectId);
  } else {
    await eraseAllProjectContracts(admin, organizationId, projectId);
  }

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
    .from("project_status_history")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_notes")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await eraseInboundMail(admin, organizationId, { projectId });
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
    documentsRemoved: [...new Set(storageToRemove)].length,
    appointmentsRemoved: orphans.appointmentsRemoved,
    peopleErased: orphans.peopleErased,
  };
}

/** Drop unsigned drafts / open envelopes; keep completed signed archives. */
async function scrubUnsignedProjectContracts(
  admin: AdminClient,
  organizationId: string,
  projectId: string,
) {
  const { data: openContracts } = await admin
    .from("project_contracts")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId)
    .in("status", ["draft", "pending_signature"]);
  const openIds = (openContracts ?? []).map((row) => row.id as string);
  if (openIds.length === 0) return;

  const { data: envelopes } = await admin
    .from("contract_envelopes")
    .select("id, signed_pdf_storage_path")
    .eq("organization_id", organizationId)
    .in("project_contract_id", openIds);
  const envelopeIds = (envelopes ?? []).map((row) => row.id as string);
  const pdfPaths = (envelopes ?? [])
    .map((row) => row.signed_pdf_storage_path as string | null)
    .filter((path): path is string => Boolean(path));
  if (pdfPaths.length > 0) {
    const { CONTRACT_ENVELOPES_BUCKET } = await import("@/lib/contracts/types");
    const { error } = await admin.storage
      .from(CONTRACT_ENVELOPES_BUCKET)
      .remove(pdfPaths);
    if (error) console.error("scrub open contract pdfs:", error.message);
  }
  if (envelopeIds.length > 0) {
    await admin
      .from("contract_envelopes")
      .delete()
      .eq("organization_id", organizationId)
      .in("id", envelopeIds);
  }
  await admin
    .from("project_contracts")
    .delete()
    .eq("organization_id", organizationId)
    .in("id", openIds);
}

/** Full delete: remove signed archives and envelopes before project CASCADE. */
async function eraseAllProjectContracts(
  admin: AdminClient,
  organizationId: string,
  projectId: string,
) {
  const { data: archived } = await admin
    .from("project_contract_files")
    .select("storage_path")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await removeStoragePaths(
    admin,
    (archived ?? []).map((row) => row.storage_path as string),
  );
  await removeStoragePaths(
    admin,
    await listStorageUnderPrefix(
      admin,
      `${organizationId}/${projectId}/contracts`,
    ),
  );

  const { data: envelopes } = await admin
    .from("contract_envelopes")
    .select("id, signed_pdf_storage_path")
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  const pdfPaths = (envelopes ?? [])
    .map((row) => row.signed_pdf_storage_path as string | null)
    .filter((path): path is string => Boolean(path));
  if (pdfPaths.length > 0) {
    const { CONTRACT_ENVELOPES_BUCKET } = await import("@/lib/contracts/types");
    const { error } = await admin.storage
      .from(CONTRACT_ENVELOPES_BUCKET)
      .remove(pdfPaths);
    if (error) console.error("erase project contract pdfs:", error.message);
  }

  await admin
    .from("project_contract_files")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("contract_envelopes")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
  await admin
    .from("project_contracts")
    .delete()
    .eq("organization_id", organizationId)
    .eq("project_id", projectId);
}
