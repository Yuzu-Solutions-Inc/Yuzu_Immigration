import { defaultDocumentsForProgram } from "@/lib/documents/catalog";
import { createServiceClient } from "@/lib/supabase/admin";

/** Seed passport/photo defaults for share-token clients (service role). */
export async function seedShareDocumentDefaults(input: {
  organizationId: string;
  projectId: string;
  programFamily: string;
  personIds: string[];
}) {
  if (input.personIds.length === 0) return;

  const admin = createServiceClient();
  const { data: existing, error } = await admin
    .from("project_document_requests")
    .select("person_id, doc_key")
    .eq("project_id", input.projectId)
    .in("doc_key", ["passport", "photo"]);

  if (error) {
    console.error("seedShareDocumentDefaults:", error.message);
    return;
  }

  const have = new Set(
    (existing ?? []).map((r) => `${r.person_id}:${r.doc_key}`),
  );
  const defaults = defaultDocumentsForProgram(input.programFamily);
  const inserts = [];

  for (const personId of input.personIds) {
    for (const seed of defaults) {
      const key = `${personId}:${seed.docKey}`;
      if (have.has(key)) continue;
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
    console.error("seedShareDocumentDefaults insert:", insertError.message);
  }
}
