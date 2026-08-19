import { defaultDocumentsForProgram } from "@/lib/documents/catalog";
import { createServiceClient } from "@/lib/supabase/admin";

/** Seed passport/photo defaults for portal clients (service role). */
export async function seedProjectDocumentDefaults(input: {
  organizationId: string;
  projectId: string;
  programFamily: string;
  personIds: string[];
}) {
  if (input.personIds.length === 0) return;

  const admin = createServiceClient();
  const { data: existing, error } = await admin
    .from("project_document_requests")
    .select("person_id")
    .eq("project_id", input.projectId);

  if (error) {
    console.error("seedProjectDocumentDefaults:", error.message);
    return;
  }

  const seededPeople = new Set(
    (existing ?? []).map((r) => r.person_id as string),
  );
  const defaults = defaultDocumentsForProgram(input.programFamily);
  const inserts = [];

  for (const personId of input.personIds) {
    if (seededPeople.has(personId)) continue;
    for (const seed of defaults) {
      inserts.push({
        organization_id: input.organizationId,
        project_id: input.projectId,
        person_id: personId,
        doc_key: seed.docKey,
        is_required: seed.isRequired,
        sort_order: seed.sortOrder,
        status: "requested" as const,
      });
    }
  }

  if (inserts.length === 0) return;

  const { error: insertError } = await admin
    .from("project_document_requests")
    .insert(inserts);
  if (insertError) {
    console.error("seedProjectDocumentDefaults insert:", insertError.message);
  }
}
