import JSZip from "jszip";

import { product, productFileSlug } from "@/lib/brand/product";

import { downloadDecryptedDocument } from "@/lib/documents/service";
import { normalizeAnswersStore } from "@/lib/ircc/answers-store";
import { normalizeCustomAnswersStore } from "@/lib/custom-forms/answers";
import { CLOSED_FILE_RETENTION_YEARS } from "@/lib/privacy/retention";
import {
  decryptAnswersValue,
  decryptCustomAnswersValue,
  decryptDocumentFileRow,
  decryptPersonRow,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

export type PortalHouseholdExport = {
  bytes: Uint8Array;
  filename: string;
  personCount: number;
  projectCount: number;
  documentCount: number;
};

function safeSegment(value: string, fallback = "item"): string {
  const cleaned = value
    .replace(/[^\w.\-()+ ]+/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+|[._]+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function uniquePath(used: Set<string>, path: string): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const dot = path.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  let n = 2;
  let next = `${stem}_${n}${ext}`;
  while (used.has(next)) {
    n += 1;
    next = `${stem}_${n}${ext}`;
  }
  used.add(next);
  return next;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * ZIP of the signed-in portal client plus every co-participant on files they
 * belong to (identity, questionnaire answers, uploaded documents, bookings,
 * payments). Omits internal consultant notes.
 */
export async function buildPortalHouseholdExport(input: {
  organizationId: string;
  personId: string;
}): Promise<PortalHouseholdExport | { error: "not_found" }> {
  const admin = createServiceClient();
  const key = await getOrgDataKey(input.organizationId);

  const { data: selfRow } = await admin
    .from("people")
    .select(
      "id, first_name, last_name, email, phone, preferred_locale, immigration_status, status_expires_at, created_at",
    )
    .eq("id", input.personId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (!selfRow) return { error: "not_found" };
  const self = decryptPersonRow(selfRow, key);

  const { data: links } = await admin
    .from("project_participants")
    .select("project_id, role, left_at, created_at")
    .eq("person_id", input.personId)
    .eq("organization_id", input.organizationId);

  const projectIds = [
    ...new Set((links ?? []).map((row) => row.project_id as string)),
  ];

  const { data: projectRows } =
    projectIds.length > 0
      ? await admin
          .from("immigration_projects")
          .select(
            "id, title, status, status_at, program_family, jurisdiction, opened_at, closed_at, retain_until, destroyed_at",
          )
          .eq("organization_id", input.organizationId)
          .in("id", projectIds)
      : { data: [] as Record<string, unknown>[] };

  const liveProjects = (
    (projectRows ?? []) as Array<{
      id: string;
      title: string;
      status: string;
      status_at: string | null;
      program_family: string;
      jurisdiction: string | null;
      opened_at: string | null;
      closed_at: string | null;
      retain_until: string | null;
      destroyed_at: string | null;
    }>
  ).filter((row) => !row.destroyed_at);

  const liveProjectIds = liveProjects.map((row) => row.id);

  const { data: allParticipants } =
    liveProjectIds.length > 0
      ? await admin
          .from("project_participants")
          .select("id, project_id, person_id, role, left_at, created_at")
          .eq("organization_id", input.organizationId)
          .in("project_id", liveProjectIds)
      : { data: [] as Record<string, unknown>[] };

  const personIds = [
    ...new Set(
      [
        input.personId,
        ...((allParticipants ?? []) as Array<{ person_id: string }>).map(
          (row) => row.person_id,
        ),
      ].filter(Boolean),
    ),
  ];

  const { data: peopleRows } =
    personIds.length > 0
      ? await admin
          .from("people")
          .select(
            "id, first_name, last_name, email, phone, preferred_locale, immigration_status, status_expires_at, created_at",
          )
          .eq("organization_id", input.organizationId)
          .in("id", personIds)
      : { data: [] as Record<string, unknown>[] };

  const people = ((peopleRows ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    preferred_locale: string | null;
    immigration_status: string;
    status_expires_at: string | null;
    created_at: string;
  }>).map((row) => decryptPersonRow(row, key));

  const { data: answersRows } =
    liveProjectIds.length > 0
      ? await admin
          .from("project_form_answers")
          .select("project_id, answers")
          .eq("organization_id", input.organizationId)
          .in("project_id", liveProjectIds)
      : { data: [] as Record<string, unknown>[] };

  const answersByProject = new Map(
    ((answersRows ?? []) as Array<{ project_id: string; answers: unknown }>).map(
      (row) => [
        row.project_id,
        normalizeAnswersStore(decryptAnswersValue(row.answers, key)),
      ],
    ),
  );

  const { data: customAnswersRows } =
    liveProjectIds.length > 0
      ? await admin
          .from("project_custom_form_answers")
          .select("project_id, answers")
          .eq("organization_id", input.organizationId)
          .in("project_id", liveProjectIds)
      : { data: [] as Record<string, unknown>[] };

  const customAnswersByProject = new Map(
    ((customAnswersRows ?? []) as Array<{ project_id: string; answers: unknown }>).map(
      (row) => [
        row.project_id,
        normalizeCustomAnswersStore(decryptCustomAnswersValue(row.answers, key)),
      ],
    ),
  );

  const { data: docRows } =
    liveProjectIds.length > 0
      ? await admin
          .from("project_document_files")
          .select(
            "id, project_id, person_id, storage_path, original_filename, content_type, byte_size, created_at",
          )
          .eq("organization_id", input.organizationId)
          .in("project_id", liveProjectIds)
      : { data: [] as Record<string, unknown>[] };

  const { data: payments } = await admin
    .from("payment_requests")
    .select(
      "id, description, amount_cents, currency, status, paid_at, created_at, person_id, project_id",
    )
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  const liveSet = new Set(liveProjectIds);
  const personSet = new Set(personIds);
  const relevantPayments = (
    (payments ?? []) as Array<{
      id: string;
      description: string;
      amount_cents: number;
      currency: string;
      status: string;
      paid_at: string | null;
      created_at: string;
      person_id: string | null;
      project_id: string | null;
    }>
  ).filter(
    (row) =>
      (row.person_id != null && personSet.has(row.person_id)) ||
      (row.project_id != null && liveSet.has(row.project_id)),
  );

  const { data: appointments } =
    personIds.length > 0
      ? await admin
          .from("booking_appointments")
          .select(
            "id, person_id, starts_at, ends_at, status, service_id, created_at",
          )
          .eq("organization_id", input.organizationId)
          .in("person_id", personIds)
          .order("starts_at", { ascending: false })
          .limit(200)
      : { data: [] as Record<string, unknown>[] };

  const zip = new JSZip();
  const used = new Set<string>();
  const warnings: string[] = [];

  zip.file(
    "README.txt",
    [
      `${product.name} — client portal data export`,
      `Exported at: ${new Date().toISOString()}`,
      "",
      "This archive contains your personal information and the information of",
      "other people on immigration files you belong to (for example a spouse",
      "or child on the same file).",
      "",
      "Included: identity, questionnaire answers, uploaded documents,",
      "appointments, and payment records.",
      "Omitted: internal consultant notes; encryption keys; lookup hashes;",
      "portal passwords; payment tokens; storage paths.",
      "",
      "It does not include internal consultant notes.",
      `Closed files are typically retained for ${CLOSED_FILE_RETENTION_YEARS} years under College of`,
      "Immigration and Citizenship Consultants client-file rules.",
      "",
    ].join("\n"),
  );

  zip.file(
    "you.json",
    json({
      id: self.id,
      first_name: self.first_name,
      last_name: self.last_name,
      email: self.email,
      phone: self.phone,
      preferred_locale: self.preferred_locale,
      immigration_status: self.immigration_status,
      status_expires_at: self.status_expires_at,
      created_at: self.created_at,
      projectLinks: links ?? [],
    }),
  );

  zip.file("appointments.json", json(appointments ?? []));
  zip.file("payments.json", json(relevantPayments));

  for (const person of people) {
    const slug = uniquePath(
      used,
      `clients/${safeSegment(`${person.last_name}_${person.first_name}`, person.id.slice(0, 8))}.json`,
    );
    zip.file(
      slug,
      json({
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
        phone: person.phone,
        preferred_locale: person.preferred_locale,
        immigration_status: person.immigration_status,
        status_expires_at: person.status_expires_at,
        created_at: person.created_at,
        isRequester: person.id === input.personId,
      }),
    );
  }

  let documentCount = 0;
  for (const project of liveProjects) {
    const decrypted = decryptProjectRow(project, key);
    const folder = uniquePath(
      used,
      `projects/${safeSegment(decrypted.title, project.id.slice(0, 8))}`,
    );
    const participants = (
      (allParticipants ?? []) as Array<{
        project_id: string;
        person_id: string;
        role: string;
        left_at: string | null;
        created_at: string;
      }>
    ).filter((row) => row.project_id === project.id);

    zip.file(
      `${folder}/project.json`,
      json({
        id: project.id,
        title: decrypted.title,
        status: project.status,
        status_at: project.status_at,
        program_family: project.program_family,
        jurisdiction: project.jurisdiction,
        opened_at: project.opened_at,
        closed_at: project.closed_at,
        retain_until: project.retain_until,
        participants,
      }),
    );
    zip.file(
      `${folder}/answers.json`,
      json(answersByProject.get(project.id) ?? { byPerson: {}, project: {} }),
    );
    zip.file(
      `${folder}/custom-answers.json`,
      json(
        customAnswersByProject.get(project.id) ?? { byPerson: {}, project: {} },
      ),
    );

    const files = (
      (docRows ?? []) as Array<{
        id: string;
        project_id: string;
        person_id: string;
        storage_path: string;
        original_filename: string;
        content_type: string;
        byte_size: number;
        created_at: string;
      }>
    )
      .filter((row) => row.project_id === project.id)
      .map((row) => decryptDocumentFileRow(row, key));

    for (const file of files) {
      const filename = uniquePath(
        used,
        `${folder}/documents/${safeSegment(file.original_filename, file.id.slice(0, 8))}`,
      );
      try {
        const downloaded = await downloadDecryptedDocument({
          organizationId: input.organizationId,
          storagePath: file.storage_path,
          contentType: file.content_type,
          originalFilename: file.original_filename,
        });
        zip.file(filename, downloaded.buffer);
        documentCount += 1;
      } catch (err) {
        console.error("portal household document:", err);
        warnings.push(`Could not include document ${file.id}`);
      }
    }
  }

  if (warnings.length > 0) {
    zip.file("warnings.json", json(warnings));
  }

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  const safeName = safeSegment(
    `${self.last_name}_${self.first_name}`,
    input.personId.slice(0, 8),
  );

  return {
    bytes,
    filename: `${productFileSlug()}-portal-export-${safeName}.zip`,
    personCount: people.length,
    projectCount: liveProjects.length,
    documentCount,
  };
}
