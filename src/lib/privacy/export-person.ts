import {
  getPersonAnswers,
  getProjectAnswers,
  normalizeAnswersStore,
} from "@/lib/ircc/answers-store";
import {
  decryptAnswersValue,
  decryptBookingFormAnswers,
  decryptBookingGuestRow,
  decryptDocumentFileRow,
  decryptDocumentRequestRow,
  decryptNoteBody,
  decryptPersonRow,
  decryptProjectRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";

export type PersonDataExportPayload = {
  formatVersion: 1;
  purpose: string;
  exportedAt: string;
  organizationId: string;
  omissions: string[];
  person: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    preferred_locale: string;
    immigration_status: string;
    status_expires_at: string | null;
    created_at: string;
    updated_at: string;
  };
  notes: Array<{
    id: string;
    body: string;
    appointment_id: string | null;
    occurred_at: string | null;
    status: string | null;
    created_at: string;
    updated_at: string;
  }>;
  portalAccess: {
    is_active: boolean;
    expires_at: string | null;
    last_authenticated_at: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  projectParticipations: Array<{
    id: string;
    role: string;
    left_at: string | null;
    project_id: string;
    created_at: string;
  }>;
  projects: Array<{
    id: string;
    title: string;
    description: string | null;
    notes: string | null;
    status: string;
    program_family: string;
    jurisdiction: string | null;
    form_language: string | null;
    opened_at: string | null;
    closed_at: string | null;
    retain_until: string | null;
    destroyed_at: string | null;
    status_at: string | null;
  }>;
  forms: Array<{
    id: string;
    project_id: string;
    form_code: string;
    person_id: string | null;
    status: string;
    is_required: boolean;
    sort_order: number;
    generated_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
  formAnswers: Array<{
    project_id: string;
    project_title: string | null;
    questionnaire_submitted_at: string | null;
    current_section: string | null;
    updated_at: string;
    /** Questionnaire fields answered for this person on the file. */
    personAnswers: Record<string, unknown>;
    /**
     * Shared file-level questionnaire fields (e.g. couple / common-law).
     * Included because they are part of the person's immigration file.
     */
    projectScopedAnswers: Record<string, unknown>;
  }>;
  documentRequests: Array<{
    id: string;
    project_id: string;
    doc_key: string;
    custom_label: string | null;
    request_scope: string;
    is_required: boolean;
    status: string;
    consultant_note: string | null;
    rejection_comment: string | null;
    created_at: string;
    updated_at: string;
  }>;
  documents: Array<{
    id: string;
    project_id: string;
    original_filename: string;
    content_type: string;
    byte_size: number;
    uploaded_via: string;
    created_at: string;
    note: string;
  }>;
  shareLinks: Array<{
    project_id: string;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
    last_accessed_at: string | null;
  }>;
  bookingInvites: Array<{
    id: string;
    project_id: string;
    service_id: string;
    expires_at: string;
    revoked_at: string | null;
    appointment_id: string | null;
    emailed_to: string | null;
    created_at: string;
  }>;
  appointments: Array<{
    id: string;
    service_id: string;
    project_id: string | null;
    starts_at: string;
    ends_at: string;
    guest_name: string;
    guest_email: string;
    guest_phone: string;
    guest_address: string;
    guest_preferred_locale: string | null;
    status: string;
    cancelled_at: string | null;
    meet_join_url: string | null;
    form_answers: Record<string, string>;
    privacy_accepted_at: string;
    created_at: string;
    updated_at: string;
  }>;
  payments: Array<{
    id: string;
    source: string;
    status: string;
    amount_cents: number;
    currency: string;
    description: string;
    project_id: string | null;
    appointment_id: string | null;
    paid_at: string | null;
    refunded_at: string | null;
    expires_at: string | null;
    created_at: string;
  }>;
};

const OMISSIONS = [
  "Encryption keys, wrapped org DEKs, and ciphertext blobs",
  "Lookup / search hashes (email_lookup_hash, portal_email_hash, search_name)",
  "Portal access codes and access tokens",
  "Share-link, booking-invite, payment, and manage tokens (hash or encrypted)",
  "Storage paths and encryption algorithm identifiers for uploaded files",
  "Portal password secrets",
  "Binary document content (filenames and metadata only; use full file export for binaries)",
] as const;

/**
 * Build a Loi 25 / PIPEDA access-package JSON for one client (person).
 * Decrypts PII and questionnaire answers; omits crypto material and secrets.
 */
export async function buildPersonDataExport(input: {
  organizationId: string;
  personId: string;
}): Promise<PersonDataExportPayload | { error: "not_found" }> {
  const supabase = await createClient();
  const key = await getOrgDataKey(input.organizationId);

  const { data: person, error: personError } = await supabase
    .from("people")
    .select(
      "id, first_name, last_name, email, phone, preferred_locale, immigration_status, status_expires_at, created_at, updated_at",
    )
    .eq("id", input.personId)
    .eq("organization_id", input.organizationId)
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

  const [
    { data: notes },
    { data: participants },
    { data: portalRow },
    { data: docFiles },
    { data: docRequests },
    { data: personForms },
    { data: appointments },
    { data: bookingInvites },
  ] = await Promise.all([
    supabase
      .from("person_notes")
      .select(
        "id, body, appointment_id, occurred_at, status, created_at, updated_at",
      )
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_participants")
      .select("id, role, left_at, project_id, created_at")
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId),
    supabase
      .from("customer_portal_access")
      .select(
        "is_active, expires_at, last_authenticated_at, created_at, updated_at",
      )
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId)
      .maybeSingle(),
    supabase
      .from("project_document_files")
      .select(
        "id, project_id, original_filename, content_type, byte_size, uploaded_via, created_at",
      )
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId),
    supabase
      .from("project_document_requests")
      .select(
        "id, project_id, doc_key, custom_label, request_scope, is_required, status, consultant_note, rejection_comment, created_at, updated_at",
      )
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("project_forms")
      .select(
        "id, project_id, form_code, person_id, status, is_required, sort_order, generated_at, created_at, updated_at",
      )
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("booking_appointments")
      .select(
        "id, service_id, project_id, starts_at, ends_at, guest_name, guest_email, guest_phone, guest_address, guest_preferred_locale, status, cancelled_at, meet_join_url, form_answers, privacy_accepted_at, created_at, updated_at",
      )
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId)
      .order("starts_at", { ascending: false }),
    supabase
      .from("project_booking_invites")
      .select(
        "id, project_id, service_id, expires_at, revoked_at, appointment_id, emailed_to, created_at",
      )
      .eq("person_id", input.personId)
      .eq("organization_id", input.organizationId)
      .order("created_at", { ascending: false }),
  ]);

  const participationRows = (participants ?? []) as Array<{
    id: string;
    role: string;
    left_at: string | null;
    project_id: string;
    created_at: string;
  }>;

  const projectIds = [
    ...new Set(participationRows.map((p) => p.project_id)),
  ];
  const projectIdSet = new Set(projectIds);

  const { data: paymentRows } = await supabase
    .from("payment_requests")
    .select(
      "id, source, status, amount_cents, currency, description, project_id, person_id, appointment_id, paid_at, refunded_at, expires_at, created_at",
    )
    .eq("organization_id", input.organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  const payments = (
    (paymentRows ?? []) as Array<{
      id: string;
      source: string;
      status: string;
      amount_cents: number;
      currency: string;
      description: string;
      project_id: string | null;
      person_id: string | null;
      appointment_id: string | null;
      paid_at: string | null;
      refunded_at: string | null;
      expires_at: string | null;
      created_at: string;
    }>
  ).filter(
    (row) =>
      row.person_id === input.personId ||
      (row.project_id != null && projectIdSet.has(row.project_id)),
  );

  const principalByProject = new Map<string, string>();
  if (projectIds.length > 0) {
    const { data: allParticipants } = await supabase
      .from("project_participants")
      .select("project_id, person_id, role, left_at")
      .eq("organization_id", input.organizationId)
      .in("project_id", projectIds)
      .is("left_at", null);
    for (const row of allParticipants ?? []) {
      if ((row.role as string) === "principal") {
        principalByProject.set(
          row.project_id as string,
          row.person_id as string,
        );
      }
    }
  }

  const { data: projects } =
    projectIds.length > 0
      ? await supabase
          .from("immigration_projects")
          .select(
            "id, title, description, notes, status, program_family, jurisdiction, form_language, opened_at, closed_at, retain_until, destroyed_at, status_at",
          )
          .eq("organization_id", input.organizationId)
          .in("id", projectIds)
      : { data: [] as Record<string, unknown>[] };

  const decryptedProjects = (
    (projects ?? []) as Array<{
      id: string;
      title: string;
      description: string | null;
      notes: string | null;
      status: string;
      program_family: string;
      jurisdiction: string | null;
      form_language: string | null;
      opened_at: string | null;
      closed_at: string | null;
      retain_until: string | null;
      destroyed_at: string | null;
      status_at: string | null;
    }>
  ).map((project) => decryptProjectRow(project, key));

  const projectTitleById = new Map(
    decryptedProjects.map((p) => [p.id, p.title as string]),
  );

  type AnswersRow = {
    project_id: string;
    answers: unknown;
    current_section: string | null;
    questionnaire_submitted_at: string | null;
    updated_at: string;
  };
  type ShareLinkRow = {
    project_id: string;
    expires_at: string;
    revoked_at: string | null;
    created_at: string;
    last_accessed_at: string | null;
  };
  type FormRow = {
    id: string;
    project_id: string;
    form_code: string;
    person_id: string | null;
    status: string;
    is_required: boolean;
    sort_order: number;
    generated_at: string | null;
    created_at: string;
    updated_at: string;
  };

  let answers: AnswersRow[] = [];
  let links: ShareLinkRow[] = [];
  let scopedForms: FormRow[] = [];

  if (projectIds.length > 0) {
    const [answersResult, shareLinksResult, scopedFormsResult] =
      await Promise.all([
        supabase
          .from("project_form_answers")
          .select(
            "project_id, answers, current_section, questionnaire_submitted_at, updated_at",
          )
          .eq("organization_id", input.organizationId)
          .in("project_id", projectIds),
        supabase
          .from("form_share_links")
          .select(
            "project_id, expires_at, revoked_at, created_at, last_accessed_at",
          )
          .eq("organization_id", input.organizationId)
          .in("project_id", projectIds)
          .order("created_at", { ascending: false }),
        supabase
          .from("project_forms")
          .select(
            "id, project_id, form_code, person_id, status, is_required, sort_order, generated_at, created_at, updated_at",
          )
          .eq("organization_id", input.organizationId)
          .in("project_id", projectIds)
          .is("person_id", null)
          .order("sort_order", { ascending: true }),
      ]);
    answers = (answersResult.data ?? []) as AnswersRow[];
    links = (shareLinksResult.data ?? []) as ShareLinkRow[];
    scopedForms = (scopedFormsResult.data ?? []) as FormRow[];
  }

  const formAnswers = answers.map((row) => {
    const store = normalizeAnswersStore(decryptAnswersValue(row.answers, key), {
      principalPersonId: principalByProject.get(row.project_id) ?? null,
    });
    return {
      project_id: row.project_id,
      project_title: projectTitleById.get(row.project_id) ?? null,
      questionnaire_submitted_at: row.questionnaire_submitted_at,
      current_section: row.current_section,
      updated_at: row.updated_at,
      personAnswers: getPersonAnswers(store, input.personId),
      projectScopedAnswers: getProjectAnswers(store),
    };
  });

  const forms = [
    ...((personForms ?? []) as FormRow[]),
    ...scopedForms,
  ].sort(
    (a, b) =>
      a.sort_order - b.sort_order || a.form_code.localeCompare(b.form_code),
  );

  return {
    formatVersion: 1,
    purpose:
      "Portable copy of personal information held for this client (Loi 25 / PIPEDA access request support).",
    exportedAt: new Date().toISOString(),
    organizationId: input.organizationId,
    omissions: [...OMISSIONS],
    person: {
      id: person.id as string,
      first_name: decryptedPerson.first_name as string,
      last_name: decryptedPerson.last_name as string,
      email: (decryptedPerson.email as string | null) ?? null,
      phone: (decryptedPerson.phone as string | null) ?? null,
      preferred_locale: person.preferred_locale as string,
      immigration_status: person.immigration_status as string,
      status_expires_at: (person.status_expires_at as string | null) ?? null,
      created_at: person.created_at as string,
      updated_at: person.updated_at as string,
    },
    notes: (notes ?? []).map((note) => ({
      id: note.id as string,
      body: decryptNoteBody(note.body as string, key),
      appointment_id: (note.appointment_id as string | null) ?? null,
      occurred_at: (note.occurred_at as string | null) ?? null,
      status: (note.status as string | null) ?? null,
      created_at: note.created_at as string,
      updated_at: note.updated_at as string,
    })),
    portalAccess: portalRow
      ? {
          is_active: portalRow.is_active as boolean,
          expires_at: (portalRow.expires_at as string | null) ?? null,
          last_authenticated_at:
            (portalRow.last_authenticated_at as string | null) ?? null,
          created_at: portalRow.created_at as string,
          updated_at: portalRow.updated_at as string,
        }
      : null,
    projectParticipations: participationRows,
    projects: decryptedProjects.map((project) => ({
      id: project.id,
      title: project.title,
      description: project.description ?? null,
      notes: project.notes ?? null,
      status: project.status,
      program_family: project.program_family,
      jurisdiction: project.jurisdiction,
      form_language: project.form_language,
      opened_at: project.opened_at,
      closed_at: project.closed_at,
      retain_until: project.retain_until,
      destroyed_at: project.destroyed_at,
      status_at: project.status_at,
    })),
    forms,
    formAnswers,
    documentRequests: (docRequests ?? []).map((row) => {
      const decrypted = decryptDocumentRequestRow(
        row as {
          custom_label: string | null;
          consultant_note: string | null;
          rejection_comment: string | null;
        },
        key,
      );
      return {
        id: row.id as string,
        project_id: row.project_id as string,
        doc_key: row.doc_key as string,
        custom_label: decrypted.custom_label ?? null,
        request_scope: row.request_scope as string,
        is_required: row.is_required as boolean,
        status: row.status as string,
        consultant_note: decrypted.consultant_note ?? null,
        rejection_comment: decrypted.rejection_comment ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      };
    }),
    documents: (docFiles ?? []).map((f) => ({
      ...decryptDocumentFileRow(
        {
          id: f.id as string,
          project_id: f.project_id as string,
          original_filename: f.original_filename as string,
          content_type: f.content_type as string,
          byte_size: f.byte_size as number,
          uploaded_via: f.uploaded_via as string,
          created_at: f.created_at as string,
        },
        key,
      ),
      note: "Document ciphertext is stored encrypted; binary content omitted from this JSON package. Use the full file export for decrypted binaries.",
    })),
    shareLinks: links,
    bookingInvites: (bookingInvites ?? []).map((row) => ({
      id: row.id as string,
      project_id: row.project_id as string,
      service_id: row.service_id as string,
      expires_at: row.expires_at as string,
      revoked_at: (row.revoked_at as string | null) ?? null,
      appointment_id: (row.appointment_id as string | null) ?? null,
      emailed_to: (row.emailed_to as string | null) ?? null,
      created_at: row.created_at as string,
    })),
    appointments: (appointments ?? []).map((row) => {
      const guest = decryptBookingGuestRow(
        row as {
          guest_name: string;
          guest_email: string;
          guest_phone: string;
          guest_address: string;
        },
        key,
      );
      return {
        id: row.id as string,
        service_id: row.service_id as string,
        project_id: (row.project_id as string | null) ?? null,
        starts_at: row.starts_at as string,
        ends_at: row.ends_at as string,
        guest_name: guest.guest_name,
        guest_email: guest.guest_email,
        guest_phone: guest.guest_phone,
        guest_address: guest.guest_address,
        guest_preferred_locale:
          (row.guest_preferred_locale as string | null) ?? null,
        status: row.status as string,
        cancelled_at: (row.cancelled_at as string | null) ?? null,
        meet_join_url: (row.meet_join_url as string | null) ?? null,
        form_answers: decryptBookingFormAnswers(row.form_answers, key),
        privacy_accepted_at: row.privacy_accepted_at as string,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
      };
    }),
    payments: payments.map((row) => ({
      id: row.id,
      source: row.source,
      status: row.status,
      amount_cents: row.amount_cents,
      currency: row.currency,
      description: row.description,
      project_id: row.project_id,
      appointment_id: row.appointment_id,
      paid_at: row.paid_at,
      refunded_at: row.refunded_at,
      expires_at: row.expires_at,
      created_at: row.created_at,
    })),
  };
}
