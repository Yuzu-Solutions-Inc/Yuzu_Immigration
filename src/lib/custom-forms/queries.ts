import type { CustomFormScope } from "@/lib/custom-forms/schema";
import {
  mapCustomFormTemplateRow,
  mapProjectCustomFormRow,
  parseCustomFormSchema,
  type CustomFormTemplateRow,
  type ProjectCustomFormRow,
} from "@/lib/custom-forms/schema";
import {
  emptyCustomAnswersStore,
  normalizeCustomAnswersStore,
  type CustomAnswersStore,
} from "@/lib/custom-forms/answers";
import {
  customFormStatusFromCounts,
  customFormsFillPercent,
  customSchemaFillCounts,
} from "@/lib/custom-forms/completeness";
import {
  decryptCustomAnswersValue,
  encryptCustomAnswersValue,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

type DbClient = SupabaseClient;

async function db(client?: DbClient) {
  return client ?? (await createClient());
}

export async function listCustomFormTemplates(
  organizationId: string,
  options?: { includeInactive?: boolean },
): Promise<CustomFormTemplateRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("custom_form_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("updated_at", { ascending: false });
  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }
  const { data, error } = await query;
  if (error) {
    console.error("listCustomFormTemplates:", error.message);
    return [];
  }
  return (data ?? []).map((row) =>
    mapCustomFormTemplateRow(row as Record<string, unknown>),
  );
}

export async function getCustomFormTemplate(
  organizationId: string,
  templateId: string,
): Promise<CustomFormTemplateRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_form_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("getCustomFormTemplate:", error.message);
    return null;
  }
  return mapCustomFormTemplateRow(data as Record<string, unknown>);
}

export async function listProjectCustomForms(
  projectId: string,
  client?: DbClient,
): Promise<ProjectCustomFormRow[]> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("project_custom_forms")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("listProjectCustomForms:", error.message);
    return [];
  }
  return (data ?? []).map((row) =>
    mapProjectCustomFormRow(row as Record<string, unknown>),
  );
}

export async function getProjectCustomFormAnswers(
  projectId: string,
  client?: DbClient,
): Promise<{
  id: string;
  organization_id: string;
  project_id: string;
  answers: CustomAnswersStore;
  current_section: string | null;
  questionnaire_submitted_at: string | null;
} | null> {
  const supabase = await db(client);
  const { data, error } = await supabase
    .from("project_custom_form_answers")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error("getProjectCustomFormAnswers:", error.message);
    return null;
  }
  if (!data) return null;
  const key = await getOrgDataKey(String(data.organization_id));
  return {
    id: String(data.id),
    organization_id: String(data.organization_id),
    project_id: String(data.project_id),
    answers: normalizeCustomAnswersStore(
      decryptCustomAnswersValue(data.answers, key),
    ),
    current_section: (data.current_section as string | null) ?? null,
    questionnaire_submitted_at:
      (data.questionnaire_submitted_at as string | null) ?? null,
  };
}

export async function upsertProjectCustomFormAnswers(input: {
  organizationId: string;
  projectId: string;
  answers: CustomAnswersStore;
  currentSection?: string | null;
  submittedAt?: string | null;
  client?: DbClient;
}) {
  const supabase = input.client ?? (await createClient());
  const payload: Record<string, unknown> = {
    organization_id: input.organizationId,
    project_id: input.projectId,
    answers: encryptCustomAnswersValue(
      input.answers,
      await getOrgDataKey(input.organizationId),
    ),
    current_section: input.currentSection ?? null,
    updated_at: new Date().toISOString(),
  };
  if (input.submittedAt !== undefined) {
    payload.questionnaire_submitted_at = input.submittedAt;
  }
  const { error } = await supabase.from("project_custom_form_answers").upsert(
    payload,
    { onConflict: "project_id" },
  );
  if (error) {
    console.error("upsertProjectCustomFormAnswers:", error.message);
    throw new Error(error.message);
  }
  await refreshCustomFormProgress(
    input.organizationId,
    input.projectId,
    supabase,
  );
}

export async function snapshotCustomFormOntoProject(input: {
  organizationId: string;
  projectId: string;
  template: CustomFormTemplateRow;
  scope: CustomFormScope;
  personIds: string[];
  isRequired?: boolean;
  sortOrder?: number;
  client?: DbClient;
}): Promise<number> {
  const supabase = input.client ?? (await createClient());
  const schema = parseCustomFormSchema(input.template.schema);
  const isRequired = input.isRequired !== false;
  const sortOrder = input.sortOrder ?? 0;
  const rows =
    input.scope === "project"
      ? [
          {
            organization_id: input.organizationId,
            project_id: input.projectId,
            template_id: input.template.id,
            title: input.template.title,
            schema,
            scope: "project" as const,
            person_id: null,
            is_required: isRequired,
            sort_order: sortOrder,
            status: "todo" as const,
          },
        ]
      : input.personIds.map((personId, index) => ({
          organization_id: input.organizationId,
          project_id: input.projectId,
          template_id: input.template.id,
          title: input.template.title,
          schema,
          scope: "person" as const,
          person_id: personId,
          is_required: isRequired,
          sort_order: sortOrder * 100 + index,
          status: "todo" as const,
        }));

  if (rows.length === 0) return 0;
  const { error } = await supabase.from("project_custom_forms").insert(rows);
  if (error) {
    if (error.code === "23505") return 0;
    console.error("snapshotCustomFormOntoProject:", error.message);
    throw new Error(error.message);
  }
  return rows.length;
}

export async function removeProjectCustomForm(input: {
  organizationId: string;
  projectId: string;
  formId: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("project_custom_forms")
    .delete()
    .eq("id", input.formId)
    .eq("project_id", input.projectId)
    .eq("organization_id", input.organizationId);
  if (error) {
    console.error("removeProjectCustomForm:", error.message);
    throw new Error(error.message);
  }
}

export async function refreshCustomFormProgress(
  organizationId: string,
  projectId: string,
  client?: DbClient,
) {
  const supabase = client ?? (await createClient());
  const [forms, answersRow, participants] = await Promise.all([
    supabase
      .from("project_custom_forms")
      .select("*")
      .eq("project_id", projectId)
      .eq("organization_id", organizationId),
    getProjectCustomFormAnswers(projectId, supabase),
    supabase
      .from("project_participants")
      .select("person_id")
      .eq("project_id", projectId)
      .is("left_at", null),
  ]);

  const mapped = (forms.data ?? []).map((row) =>
    mapProjectCustomFormRow(row as Record<string, unknown>),
  );
  const store = answersRow?.answers ?? emptyCustomAnswersStore();
  const people = (participants.data ?? []).map((row) => ({
    id: String(row.person_id),
  }));
  const percent = customFormsFillPercent(mapped, store, people);

  const { count: irccCount } = await supabase
    .from("project_forms")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("organization_id", organizationId);

  const patch: Record<string, unknown> = {
    custom_form_percent: percent,
    updated_at: new Date().toISOString(),
  };
  if ((irccCount ?? 0) === 0) {
    patch.form_percent = percent;
  }

  await supabase
    .from("immigration_projects")
    .update(patch)
    .eq("id", projectId)
    .eq("organization_id", organizationId);

  for (const form of mapped) {
    const bag =
      form.scope === "project"
        ? store.project
        : (store.byPerson[form.person_id ?? ""] ?? {});
    const counts = customSchemaFillCounts(form.schema, {
      ...store.project,
      ...bag,
    });
    const status = customFormStatusFromCounts(counts);
    if (form.status !== status) {
      await supabase
        .from("project_custom_forms")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", form.id);
    }
  }
}

export async function syncCustomFormsForParticipants(input: {
  organizationId: string;
  projectId: string;
  personIds: string[];
  client?: DbClient;
}) {
  const supabase = input.client ?? (await createClient());
  const { data, error } = await supabase
    .from("project_custom_forms")
    .select("*")
    .eq("project_id", input.projectId)
    .eq("organization_id", input.organizationId)
    .eq("scope", "person");
  if (error) {
    console.error("syncCustomFormsForParticipants:", error.message);
    return;
  }
  const rows = (data ?? []).map((row) =>
    mapProjectCustomFormRow(row as Record<string, unknown>),
  );
  const byTemplate = new Map<string, ProjectCustomFormRow[]>();
  for (const row of rows) {
    if (!row.template_id) continue;
    const list = byTemplate.get(row.template_id) ?? [];
    list.push(row);
    byTemplate.set(row.template_id, list);
  }

  const inserts: Array<Record<string, unknown>> = [];
  for (const [, copies] of byTemplate) {
    const template = copies[0];
    if (!template) continue;
    const have = new Set(copies.map((row) => row.person_id));
    input.personIds.forEach((personId, index) => {
      if (have.has(personId)) return;
      inserts.push({
        organization_id: input.organizationId,
        project_id: input.projectId,
        template_id: template.template_id,
        title: template.title,
        schema: template.schema,
        scope: "person",
        person_id: personId,
        is_required: template.is_required,
        sort_order: template.sort_order + index,
        status: "todo",
      });
    });
  }
  if (inserts.length === 0) return;
  const { error: insertError } = await supabase
    .from("project_custom_forms")
    .insert(inserts);
  if (insertError) {
    console.error("syncCustomFormsForParticipants insert:", insertError.message);
  }
}
