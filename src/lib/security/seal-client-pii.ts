import { createServiceClient } from "@/lib/supabase/admin";
import { hasAppEncryptionKey } from "@/lib/security/app-encryption-key";
import { encryptAnswersValue, PII_AAD } from "@/lib/security/client-pii";
import {
  decryptField,
  decryptJson,
  encryptField,
  isEncryptedField,
  isEncryptedJson,
} from "@/lib/security/field-crypto";
import { loadOrCreateOrgDataKey } from "@/lib/security/org-data-key";

const PAGE = 200;

export type SealClientPiiResult = {
  orgs: number;
  people: number;
  notes: number;
  projects: number;
  answers: number;
  documentFiles: number;
  documentRequests: number;
  destructions: number;
};

const dekCache = new Map<string, Buffer>();

async function orgKey(orgId: string): Promise<Buffer> {
  const cached = dekCache.get(orgId);
  if (cached) return cached;
  const key = await loadOrCreateOrgDataKey(orgId);
  dekCache.set(orgId, key);
  return key;
}

function rekeyString(
  value: string | null | undefined,
  aad: string,
  key: Buffer,
): string | undefined {
  if (value == null || value === "") return undefined;
  if (!isEncryptedField(value)) {
    return encryptField(value, aad, key);
  }
  try {
    decryptField(value, aad, key);
    return undefined;
  } catch {
    const plain = decryptField(value, aad);
    return encryptField(plain, aad, key);
  }
}

async function forEachPage<T extends { id: string }>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  visit: (row: T) => Promise<boolean>,
): Promise<number> {
  let from = 0;
  let updated = 0;
  while (true) {
    const rows = await fetchPage(from, from + PAGE - 1);
    if (rows.length === 0) break;
    for (const row of rows) {
      if (await visit(row)) updated += 1;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return updated;
}

/**
 * Ensures each org has a wrapped DEK, then re-encrypts client fields with
 * that org key. Safe to re-run: org-keyed ciphertext is left unchanged.
 */
export async function sealAllClientPii(): Promise<SealClientPiiResult> {
  if (!hasAppEncryptionKey()) {
    throw new Error("missing_encryption_key");
  }

  const admin = createServiceClient();

  const { data: orgRows, error: orgError } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true });
  if (orgError) throw new Error(`organizations: ${orgError.message}`);
  let orgs = 0;
  for (const org of orgRows ?? []) {
    await orgKey(org.id as string);
    orgs += 1;
  }

  const people = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("people")
        .select("id, organization_id, first_name, last_name, email, phone")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`people: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const first = rekeyString(row.first_name, PII_AAD.people.firstName, key);
      const last = rekeyString(row.last_name, PII_AAD.people.lastName, key);
      const email = rekeyString(row.email, PII_AAD.people.email, key);
      const phone = rekeyString(row.phone, PII_AAD.people.phone, key);
      if (first !== undefined) patch.first_name = first;
      if (last !== undefined) patch.last_name = last;
      if (email !== undefined) patch.email = email;
      if (phone !== undefined) patch.phone = phone;
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin.from("people").update(patch).eq("id", row.id);
      if (error) throw new Error(`people update: ${error.message}`);
      return true;
    },
  );

  const notes = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("person_notes")
        .select("id, organization_id, body")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`person_notes: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        body: string;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const body = rekeyString(row.body, PII_AAD.notes.body, key);
      if (body === undefined) return false;
      const { error } = await admin
        .from("person_notes")
        .update({ body })
        .eq("id", row.id);
      if (error) throw new Error(`person_notes update: ${error.message}`);
      return true;
    },
  );

  const projects = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("immigration_projects")
        .select(
          "id, organization_id, title, description, notes, destruction_note",
        )
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`immigration_projects: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        title: string;
        description: string | null;
        notes: string | null;
        destruction_note: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const title = rekeyString(row.title, PII_AAD.projects.title, key);
      const description = rekeyString(
        row.description,
        PII_AAD.projects.description,
        key,
      );
      const notesValue = rekeyString(row.notes, PII_AAD.projects.notes, key);
      const destruction = rekeyString(
        row.destruction_note,
        PII_AAD.projects.destructionNote,
        key,
      );
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (notesValue !== undefined) patch.notes = notesValue;
      if (destruction !== undefined) patch.destruction_note = destruction;
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin
        .from("immigration_projects")
        .update(patch)
        .eq("id", row.id);
      if (error) throw new Error(`immigration_projects update: ${error.message}`);
      return true;
    },
  );

  const answers = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_form_answers")
        .select("id, organization_id, answers")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_form_answers: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        answers: unknown;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      if (isEncryptedJson(row.answers)) {
        try {
          decryptField(row.answers.__mc_enc, PII_AAD.answers, key);
          return false;
        } catch {
          const plain = decryptJson(row.answers, PII_AAD.answers);
          const { error } = await admin
            .from("project_form_answers")
            .update({ answers: encryptAnswersValue(plain, key) })
            .eq("id", row.id);
          if (error) {
            throw new Error(`project_form_answers update: ${error.message}`);
          }
          return true;
        }
      }
      const { error } = await admin
        .from("project_form_answers")
        .update({ answers: encryptAnswersValue(row.answers, key) })
        .eq("id", row.id);
      if (error) throw new Error(`project_form_answers update: ${error.message}`);
      return true;
    },
  );

  const documentFiles = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_document_files")
        .select("id, organization_id, original_filename")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_document_files: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        original_filename: string;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const name = rekeyString(
        row.original_filename,
        PII_AAD.documents.originalFilename,
        key,
      );
      if (name === undefined) return false;
      const { error } = await admin
        .from("project_document_files")
        .update({ original_filename: name })
        .eq("id", row.id);
      if (error) throw new Error(`project_document_files update: ${error.message}`);
      return true;
    },
  );

  const documentRequests = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_document_requests")
        .select("id, organization_id, custom_label, consultant_note")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_document_requests: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        custom_label: string | null;
        consultant_note: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const label = rekeyString(
        row.custom_label,
        PII_AAD.documents.customLabel,
        key,
      );
      const note = rekeyString(
        row.consultant_note,
        PII_AAD.documents.consultantNote,
        key,
      );
      if (label !== undefined) patch.custom_label = label;
      if (note !== undefined) patch.consultant_note = note;
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin
        .from("project_document_requests")
        .update(patch)
        .eq("id", row.id);
      if (error) throw new Error(`project_document_requests update: ${error.message}`);
      return true;
    },
  );

  const destructions = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("file_destruction_register")
        .select("id, organization_id, client_name, service_summary")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`file_destruction_register: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        client_name: string;
        service_summary: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const clientName = rekeyString(
        row.client_name,
        PII_AAD.destruction.clientName,
        key,
      );
      const summary = rekeyString(
        row.service_summary,
        PII_AAD.destruction.serviceSummary,
        key,
      );
      if (clientName !== undefined) patch.client_name = clientName;
      if (summary !== undefined) patch.service_summary = summary;
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin
        .from("file_destruction_register")
        .update(patch)
        .eq("id", row.id);
      if (error) throw new Error(`file_destruction_register update: ${error.message}`);
      return true;
    },
  );

  return {
    orgs,
    people,
    notes,
    projects,
    answers,
    documentFiles,
    documentRequests,
    destructions,
  };
}
