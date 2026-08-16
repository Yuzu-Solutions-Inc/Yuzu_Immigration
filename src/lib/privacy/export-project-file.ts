import JSZip from "jszip";

import { isFormCode } from "@/lib/ircc/catalog";
import {
  answersForPersonFill,
  normalizeAnswersStore,
} from "@/lib/ircc/answers-store";
import { fillProjectForms } from "@/lib/ircc/fill-project";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import {
  mergeAccountRepIntoAnswers,
  PROFILE_REP_SELECT,
} from "@/lib/ircc/account-rep";
import {
  getProjectFormAnswers,
  listProjectForms,
} from "@/lib/ircc/project-forms";
import {
  getProject,
  getProjectParticipants,
  getProjectStatusHistory,
  listPersonNotes,
  listProjectNotes,
} from "@/lib/crm/queries";
import {
  downloadDecryptedDocument,
  listProjectDocumentRequests,
} from "@/lib/documents/service";
import { createClient } from "@/lib/supabase/server";

export type ProjectFileExport = {
  bytes: Uint8Array;
  filename: string;
  documentCount: number;
  personCount: number;
  formPdfCount: number;
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
 * Build a decrypted ZIP of one immigration file: people, notes, questionnaire,
 * generated IRCC PDFs when possible, and uploaded documents.
 */
export async function buildProjectFileZip(
  projectId: string,
): Promise<ProjectFileExport | { error: "unauthorized" | "not_found" }> {
  const project = await getProject(projectId);
  if (!project) return { error: "not_found" };

  const warnings: string[] = [];
  const [
    participants,
    history,
    forms,
    answersRow,
    documentRequests,
  ] = await Promise.all([
    getProjectParticipants(projectId),
    getProjectStatusHistory(projectId),
    listProjectForms(projectId),
    getProjectFormAnswers(projectId),
    listProjectDocumentRequests(projectId),
  ]);

  const people = participants
    .filter((row) => row.person)
    .map((row) => ({
      ...row.person!,
      role: row.role,
      linkedAt: row.created_at,
    }));

  const notesByPerson = await Promise.all(
    people.map(async (person) => ({
      personId: person.id,
      notes: await listPersonNotes(person.id),
    })),
  );
  const notesMap = new Map(
    notesByPerson.map((entry) => [entry.personId, entry.notes]),
  );
  const projectNotes = await listProjectNotes(projectId);

  const supabase = await createClient();
  const { data: shareLinks } = await supabase
    .from("form_share_links")
    .select("id, expires_at, revoked_at, created_at, last_accessed_at")
    .eq("project_id", projectId)
    .eq("organization_id", project.organization_id)
    .order("created_at", { ascending: false });

  const principal = people.find((p) => p.role === "principal") ?? people[0];
  const store = normalizeAnswersStore(answersRow?.answers ?? {}, {
    principalPersonId: principal?.id,
  });

  const zip = new JSZip();
  const root = safeSegment(project.title, `project_${project.id.slice(0, 8)}`);
  const used = new Set<string>();

  zip.file(
    `${root}/project.json`,
    json({
      id: project.id,
      title: project.title,
      description: project.description,
      notes: project.notes,
      file_notes: projectNotes.map((note) => ({
        id: note.id,
        body: note.body,
        author_name: note.author_name,
        created_at: note.created_at,
        updated_at: note.updated_at,
      })),
      status: project.status,
      status_at: project.status_at,
      submit_before: project.submit_before,
      jurisdiction: project.jurisdiction,
      program_family: project.program_family,
      form_language: project.form_language,
      opened_at: project.opened_at,
      closed_at: project.closed_at,
      retain_until: project.retain_until,
      destroyed_at: project.destroyed_at,
      representative: project.representative
        ? {
            full_name: project.representative.full_name,
            email: project.representative.email,
          }
        : null,
      statusHistory: history.map((row) => ({
        status: row.status,
        status_at: row.status_at,
        created_at: row.created_at,
      })),
      shareLinks: (shareLinks ?? []).map((link) => ({
        expires_at: link.expires_at,
        revoked_at: link.revoked_at,
        created_at: link.created_at,
        last_accessed_at: link.last_accessed_at,
      })),
    }),
  );

  for (const [index, person] of people.entries()) {
    const slug = safeSegment(
      `${String(index + 1).padStart(2, "0")}-${person.role}-${person.last_name}_${person.first_name}`,
      person.id.slice(0, 8),
    );
    zip.file(
      `${root}/people/${slug}.json`,
      json({
        id: person.id,
        role: person.role,
        first_name: person.first_name,
        last_name: person.last_name,
        email: person.email,
        phone: person.phone,
        preferred_locale: person.preferred_locale,
        immigration_status: person.immigration_status,
        status_expires_at: person.status_expires_at,
        created_at: person.created_at,
        notes: (notesMap.get(person.id) ?? []).map((note) => ({
          body: note.body,
          author_name: note.author_name,
          created_at: note.created_at,
          updated_at: note.updated_at,
        })),
      }),
    );
  }

  zip.file(
    `${root}/forms/checklist.json`,
    json(
      forms.map((form) => ({
        form_code: form.form_code,
        person_id: form.person_id,
        status: form.status,
        is_required: form.is_required,
        generated_at: form.generated_at,
      })),
    ),
  );
  zip.file(`${root}/forms/answers.json`, json(store));

  const { data: repProfile } = project.representative_user_id
    ? await supabase
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", project.representative_user_id)
        .maybeSingle()
    : { data: null };

  const fillable = forms.filter((form) => isFormCode(form.form_code));
  let formPdfCount = 0;
  if (fillable.length > 0) {
    try {
      const projectFormCodes = forms.map((f) => f.form_code);
      const instances = fillable.map((form) => {
        const person = people.find((p) => p.id === form.person_id);
        const raw = answersForPersonFill(store, form.person_id);
        if (person?.email) raw.email = person.email;
        return {
          id: form.id,
          code: form.form_code,
          personId: form.person_id,
          answers: withProjectFormLanguage(
            mergeAccountRepIntoAnswers(raw, repProfile),
            project.form_language,
          ),
          projectFormCodes,
        };
      });
      const filled = await fillProjectForms({ instances });
      warnings.push(...filled.warnings);
      for (const pdf of filled.forms) {
        const path = uniquePath(
          used,
          `${root}/forms/pdf/${safeSegment(pdf.filename, `${pdf.code}.pdf`)}`,
        );
        zip.file(path, pdf.bytes);
        formPdfCount += 1;
      }
    } catch (error) {
      warnings.push(
        `IRCC PDFs omitted: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  zip.file(
    `${root}/documents/checklist.json`,
    json(
      documentRequests.map((row) => ({
        person_id: row.person_id,
        doc_key: row.doc_key,
        custom_label: row.custom_label,
        is_required: row.is_required,
        status: row.status,
        consultant_note: row.consultant_note,
        file: row.file
          ? {
              original_filename: row.file.original_filename,
              content_type: row.file.content_type,
              byte_size: row.file.byte_size,
              uploaded_via: row.file.uploaded_via,
              created_at: row.file.created_at,
            }
          : null,
      })),
    ),
  );

  let documentCount = 0;
  if (project.destroyed_at) {
    warnings.push(
      "Sensitive documents were securely destroyed; only remaining metadata is included.",
    );
  }

  const exportable = documentRequests.filter((request) => request.file?.storage_path);
  const { mapLimit } = await import("@/lib/async/map-limit");
  const downloadedDocs = await mapLimit(exportable, 4, async (request) => {
    const file = request.file!;
    const person = people.find((p) => p.id === file.person_id);
    const personFolder = safeSegment(
      person
        ? `${person.last_name}_${person.first_name}`
        : file.person_id.slice(0, 8),
      file.person_id.slice(0, 8),
    );
    try {
      const downloaded = await downloadDecryptedDocument({
        organizationId: project.organization_id,
        storagePath: file.storage_path,
        contentType: file.content_type,
        originalFilename: file.original_filename,
      });
      return { file, personFolder, downloaded };
    } catch (error) {
      return {
        file,
        personFolder,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  for (const item of downloadedDocs) {
    if ("error" in item && item.error) {
      warnings.push(`Could not include ${item.file.original_filename}: ${item.error}`);
      continue;
    }
    if (!("downloaded" in item) || !item.downloaded) continue;
    const path = uniquePath(
      used,
      `${root}/documents/${item.personFolder}/${safeSegment(item.downloaded.filename, "document")}`,
    );
    zip.file(path, item.downloaded.buffer);
    documentCount += 1;
  }

  zip.file(
    `${root}/manifest.json`,
    json({
      formatVersion: 1,
      product: "Yuzu Immigration",
      exportedAt: new Date().toISOString(),
      projectId: project.id,
      title: project.title,
      personCount: people.length,
      formCount: forms.length,
      formPdfCount,
      documentCount,
      warnings,
    }),
  );

  zip.file(
    `${root}/README.txt`,
    [
      "Yuzu Immigration — full file export",
      `Exported: ${new Date().toISOString()}`,
      `Project: ${project.title}`,
      "",
      "This archive is a copy of the immigration file held in Yuzu Immigration:",
      "- project.json — file metadata, status history, representative",
      "- people/ — identity and consultation notes for each person on the file",
      "- forms/ — questionnaire answers, form checklist, and IRCC PDFs when they could be generated",
      "- documents/ — uploaded supporting files (decrypted)",
      "",
      warnings.length > 0 ? `Warnings:\n${warnings.map((w) => `- ${w}`).join("\n")}` : "",
      "",
    ]
      .filter((line) => line !== undefined)
      .join("\n"),
  );

  const bytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  const filename = `file-export-${safeSegment(project.title, "project")}-${project.id.slice(0, 8)}.zip`;

  return {
    bytes,
    filename,
    documentCount,
    personCount: people.length,
    formPdfCount,
  };
}
