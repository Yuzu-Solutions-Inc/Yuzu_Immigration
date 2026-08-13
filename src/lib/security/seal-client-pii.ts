import { createServiceClient } from "@/lib/supabase/admin";
import { hasAppEncryptionKey } from "@/lib/security/app-encryption-key";
import {
  answersNeedSeal,
  encryptAnswersValue,
  encryptFilename,
  encryptNoteBody,
  fieldNeedsSeal,
  PII_AAD,
} from "@/lib/security/client-pii";
import { encryptField, encryptOptionalField } from "@/lib/security/field-crypto";

const PAGE = 200;

export type SealClientPiiResult = {
  people: number;
  notes: number;
  projects: number;
  answers: number;
  documentFiles: number;
  documentRequests: number;
  destructions: number;
};

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
 * Encrypts legacy plaintext client fields in place. Safe to re-run:
 * already-prefixed ciphertext is left unchanged.
 */
export async function sealAllClientPii(): Promise<SealClientPiiResult> {
  if (!hasAppEncryptionKey()) {
    throw new Error("missing_encryption_key");
  }

  const admin = createServiceClient();

  const people = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("people")
        .select("id, first_name, last_name, email, phone")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`people: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
      }>;
    },
    async (row) => {
      const patch: Record<string, string | null> = {};
      if (fieldNeedsSeal(row.first_name)) {
        patch.first_name = encryptField(row.first_name, PII_AAD.people.firstName);
      }
      if (fieldNeedsSeal(row.last_name)) {
        patch.last_name = encryptField(row.last_name, PII_AAD.people.lastName);
      }
      if (fieldNeedsSeal(row.email)) {
        patch.email = encryptOptionalField(row.email, PII_AAD.people.email);
      }
      if (fieldNeedsSeal(row.phone)) {
        patch.phone = encryptOptionalField(row.phone, PII_AAD.people.phone);
      }
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
        .select("id, body")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`person_notes: ${error.message}`);
      return (data ?? []) as Array<{ id: string; body: string }>;
    },
    async (row) => {
      if (!fieldNeedsSeal(row.body)) return false;
      const { error } = await admin
        .from("person_notes")
        .update({ body: encryptNoteBody(row.body) })
        .eq("id", row.id);
      if (error) throw new Error(`person_notes update: ${error.message}`);
      return true;
    },
  );

  const projects = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("immigration_projects")
        .select("id, title, description, notes, destruction_note")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`immigration_projects: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        title: string;
        description: string | null;
        notes: string | null;
        destruction_note: string | null;
      }>;
    },
    async (row) => {
      const patch: Record<string, string | null> = {};
      if (fieldNeedsSeal(row.title)) {
        patch.title = encryptField(row.title, PII_AAD.projects.title);
      }
      if (fieldNeedsSeal(row.description)) {
        patch.description = encryptOptionalField(
          row.description,
          PII_AAD.projects.description,
        );
      }
      if (fieldNeedsSeal(row.notes)) {
        patch.notes = encryptOptionalField(row.notes, PII_AAD.projects.notes);
      }
      if (fieldNeedsSeal(row.destruction_note)) {
        patch.destruction_note = encryptOptionalField(
          row.destruction_note,
          PII_AAD.projects.destructionNote,
        );
      }
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
        .select("id, answers")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_form_answers: ${error.message}`);
      return (data ?? []) as Array<{ id: string; answers: unknown }>;
    },
    async (row) => {
      if (!answersNeedSeal(row.answers)) return false;
      const { error } = await admin
        .from("project_form_answers")
        .update({ answers: encryptAnswersValue(row.answers) })
        .eq("id", row.id);
      if (error) throw new Error(`project_form_answers update: ${error.message}`);
      return true;
    },
  );

  const documentFiles = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_document_files")
        .select("id, original_filename")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_document_files: ${error.message}`);
      return (data ?? []) as Array<{ id: string; original_filename: string }>;
    },
    async (row) => {
      if (!fieldNeedsSeal(row.original_filename)) return false;
      const { error } = await admin
        .from("project_document_files")
        .update({ original_filename: encryptFilename(row.original_filename) })
        .eq("id", row.id);
      if (error) throw new Error(`project_document_files update: ${error.message}`);
      return true;
    },
  );

  const documentRequests = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_document_requests")
        .select("id, custom_label, consultant_note")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_document_requests: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        custom_label: string | null;
        consultant_note: string | null;
      }>;
    },
    async (row) => {
      const patch: Record<string, string | null> = {};
      if (fieldNeedsSeal(row.custom_label)) {
        patch.custom_label = encryptOptionalField(
          row.custom_label,
          PII_AAD.documents.customLabel,
        );
      }
      if (fieldNeedsSeal(row.consultant_note)) {
        patch.consultant_note = encryptOptionalField(
          row.consultant_note,
          PII_AAD.documents.consultantNote,
        );
      }
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
        .select("id, client_name, service_summary")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`file_destruction_register: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        client_name: string;
        service_summary: string | null;
      }>;
    },
    async (row) => {
      const patch: Record<string, string | null> = {};
      if (fieldNeedsSeal(row.client_name)) {
        patch.client_name = encryptField(
          row.client_name,
          PII_AAD.destruction.clientName,
        );
      }
      if (fieldNeedsSeal(row.service_summary)) {
        patch.service_summary = encryptOptionalField(
          row.service_summary,
          PII_AAD.destruction.serviceSummary,
        );
      }
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
    people,
    notes,
    projects,
    answers,
    documentFiles,
    documentRequests,
    destructions,
  };
}
