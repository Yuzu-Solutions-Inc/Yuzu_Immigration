"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isFormCode, isPersonScopedForm } from "@/lib/ircc/catalog";
import {
  answersForPersonFill,
  mergePersonQuestionnaireSave,
  normalizeAnswersStore,
} from "@/lib/ircc/answers-store";
import {
  fillProjectForms,
  zipFilledForms,
  type FillFormInstance,
} from "@/lib/ircc/fill-project";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import {
  mergeAccountRepIntoAnswers,
  PROFILE_REP_SELECT,
} from "@/lib/ircc/account-rep";
import {
  PROJECT_SCOPED_ANSWER_KEYS,
  addProjectForm,
  removeProjectForm,
  getProjectFormAnswers,
  kitOptionsFromAnswersStore,
  listActiveProjectPeople,
  listProjectForms,
  personKitAssignments,
  personKitsFromAnswersStore,
  reconcileProjectKitForms,
  syncPersonScopedFormsForParticipants,
  upsertProjectFormAnswers,
} from "@/lib/ircc/project-forms";
import { requireOrganizationId } from "@/lib/crm/queries";
import { assertProjectModifiable } from "@/lib/crm/project-lock";
import { createClient } from "@/lib/supabase/server";

export type FormsActionState = {
  error?: string;
  message?: string;
  warnings?: string[];
  submittedAt?: string;
};

async function guardProjectModifiable(projectId: string, organizationId: string) {
  const supabase = await createClient();
  return assertProjectModifiable(supabase, projectId, organizationId);
}

export async function addFormToProjectAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const formCode = String(formData.get("formCode") || "");
  const personIdRaw = String(formData.get("personId") || "");
  const locale = String(formData.get("locale") || "en");

  if (!z.string().uuid().safeParse(projectId).success || !isFormCode(formCode)) {
    return { error: "invalid" };
  }

  const personId =
    personIdRaw && z.string().uuid().safeParse(personIdRaw).success
      ? personIdRaw
      : null;

  if (isPersonScopedForm(formCode) && !personId) {
    return { error: "person_required" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  if (await guardProjectModifiable(projectId, orgId)) {
    return { error: "granted" };
  }

  try {
    await addProjectForm({
      organizationId: orgId,
      projectId,
      formCode,
      personId,
    });
  } catch {
    return { error: "add_failed" };
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "added" };
}

export async function removeFormFromProjectAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const formId = String(formData.get("formId") || "");
  const locale = String(formData.get("locale") || "en");

  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(formId).success
  ) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  if (await guardProjectModifiable(projectId, orgId)) {
    return { error: "granted" };
  }

  try {
    await removeProjectForm({
      organizationId: orgId,
      projectId,
      formId,
    });
  } catch {
    return { error: "remove_failed" };
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "removed" };
}

export async function saveProjectAnswersAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const personId = String(formData.get("personId") || "");
  const locale = String(formData.get("locale") || "en");
  const currentSection = String(formData.get("currentSection") || "") || null;
  const answersRaw = String(formData.get("answers") || "{}");

  if (
    !z.string().uuid().safeParse(projectId).success ||
    !z.string().uuid().safeParse(personId).success
  ) {
    return { error: "invalid" };
  }

  let answers: Record<string, unknown>;
  try {
    answers = JSON.parse(answersRaw) as Record<string, unknown>;
  } catch {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  if (await guardProjectModifiable(projectId, orgId)) {
    return { error: "granted" };
  }

  const supabase = await createClient();
  const people = await listActiveProjectPeople(supabase, projectId);
  const person = people.find((p) => p.id === personId);
  if (!person) return { error: "invalid" };

  const { data: project } = await supabase
    .from("immigration_projects")
    .select("form_language, representative_user_id, program_family")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const repUserId = project?.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await supabase
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  const email = String(person.email ?? "").trim();
  if (email) answers.email = email;
  answers.hasRepresentative = "Y";
  delete answers.applicationLocation;
  answers = withProjectFormLanguage(
    mergeAccountRepIntoAnswers(answers, repProfile),
    project?.form_language,
  );

  const principal = people.find((p) => p.role === "principal") ?? people[0];
  const answersRow = await getProjectFormAnswers(projectId);
  let store = normalizeAnswersStore(answersRow?.answers ?? {}, {
    principalPersonId: principal?.id,
  });
  store = mergePersonQuestionnaireSave(
    store,
    personId,
    answers,
    PROJECT_SCOPED_ANSWER_KEYS,
  );

  try {
    await upsertProjectFormAnswers({
      organizationId: orgId,
      projectId,
      answers: store,
      currentSection,
    });

    await supabase
      .from("project_forms")
      .update({
        status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)
      .eq("organization_id", orgId)
      .eq("status", "todo")
      .or(`person_id.eq.${personId},person_id.is.null`);

    const existingForms = await listProjectForms(projectId);
    const kit = kitOptionsFromAnswersStore(
      store,
      String(project?.program_family || ""),
      people.map((p) => p.role),
      existingForms.map((f) => f.form_code),
    );
    await reconcileProjectKitForms({
      organizationId: orgId,
      projectId,
      programFamily: String(project?.program_family || "other"),
      personIds: people.map((p) => p.id),
      applicationLocation: kit.applicationLocation,
      isCommonLaw: kit.isCommonLaw,
      needsCustodian: kit.needsCustodian,
      personKits: personKitAssignments(
        people.map((p) => p.id),
        personKitsFromAnswersStore(store),
      ),
    });
  } catch {
    return { error: "save_failed" };
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  revalidatePath(`/${locale}/projects/${projectId}/forms`);
  return { message: "saved" };
}

type PdfActionResult =
  | {
      ok: true;
      base64: string;
      filename: string;
      contentType: string;
      warnings: string[];
    }
  | { ok: false; error: string };

async function prepareProjectFormFill(
  projectId: string,
  formIdOrCode?: string,
): Promise<
  | { ok: false; error: string }
  | {
      ok: true;
      orgId: string;
      selected: { id: string; form_code: string; person_id: string | null }[];
      instances: FillFormInstance[];
    }
> {
  if (!z.string().uuid().safeParse(projectId).success) {
    return { ok: false, error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { ok: false, error: "unauthorized" };

  const supabase = await createClient();
  const [forms, answersRow, project, people] = await Promise.all([
    listProjectForms(projectId),
    getProjectFormAnswers(projectId),
    supabase
      .from("immigration_projects")
      .select("form_language, representative_user_id")
      .eq("id", projectId)
      .eq("organization_id", orgId)
      .maybeSingle()
      .then(({ data }) => data),
    listActiveProjectPeople(supabase, projectId),
  ]);

  if (forms.length === 0) {
    return { ok: false, error: "no_forms" };
  }

  const requested = formIdOrCode?.trim();
  let selected = forms;
  if (requested) {
    if (z.string().uuid().safeParse(requested).success) {
      selected = forms.filter((f) => f.id === requested);
    } else if (isFormCode(requested.toLowerCase())) {
      selected = forms.filter(
        (f) => f.form_code === requested.toLowerCase(),
      );
    } else {
      return { ok: false, error: "invalid" };
    }
    if (selected.length === 0) {
      return { ok: false, error: "invalid" };
    }
  }

  const repUserId = project?.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await supabase
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  const principal = people.find((p) => p.role === "principal") ?? people[0];
  const store = normalizeAnswersStore(answersRow?.answers ?? {}, {
    principalPersonId: principal?.id,
  });
  const projectFormCodes = forms.map((f) => f.form_code);

  const instances = selected.map((form) => {
    const person = people.find((p) => p.id === form.person_id);
    const raw = answersForPersonFill(store, form.person_id);
    if (person?.email) raw.email = person.email;
    const answers = withProjectFormLanguage(
      mergeAccountRepIntoAnswers(raw, repProfile),
      project?.form_language,
    );
    return {
      id: form.id,
      code: form.form_code,
      personId: form.person_id,
      answers,
      projectFormCodes,
    };
  });

  return { ok: true, orgId, selected, instances };
}

export async function generateProjectPdfsAction(
  projectId: string,
  locale: string,
  formIdOrCode?: string,
): Promise<PdfActionResult> {
  const prep = await prepareProjectFormFill(projectId, formIdOrCode);
  if (!prep.ok) return prep;

  const { orgId, selected, instances } = prep;
  const supabase = await createClient();

  try {
    const result = await fillProjectForms({ instances, preview: true });

    const generatedIds = result.forms
      .map((f) => f.formId)
      .filter((id): id is string => Boolean(id));

    if (generatedIds.length > 0) {
      await supabase
        .from("project_forms")
        .update({
          status: "generated",
          generated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("project_id", projectId)
        .eq("organization_id", orgId)
        .in("id", generatedIds);
    }

    revalidatePath(`/${locale}/projects/${projectId}`);

    if (selected.length === 1 && result.forms.length === 1) {
      const form = result.forms[0]!;
      return {
        ok: true,
        base64: Buffer.from(form.bytes).toString("base64"),
        filename: form.filename,
        contentType: "application/pdf",
        warnings: result.warnings,
      };
    }

    const zip = await zipFilledForms(result.forms);
    return {
      ok: true,
      base64: Buffer.from(zip).toString("base64"),
      filename: `ircc-forms-${projectId.slice(0, 8)}.zip`,
      contentType: "application/zip",
      warnings: result.warnings,
    };
  } catch (error) {
    console.error("generate PDFs:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "generate_failed",
    };
  }
}

/** Filled IRCC PDF for on-screen preview. Does not mark the form as generated. */
export async function previewProjectFormPdfAction(
  projectId: string,
  formId: string,
): Promise<PdfActionResult> {
  if (!z.string().uuid().safeParse(formId).success) {
    return { ok: false, error: "invalid" };
  }

  const prep = await prepareProjectFormFill(projectId, formId);
  if (!prep.ok) return prep;

  try {
    const result = await fillProjectForms({
      instances: prep.instances,
      preview: true,
    });
    const form = result.forms[0];
    if (!form) {
      return { ok: false, error: result.warnings[0] || "generate_failed" };
    }
    return {
      ok: true,
      base64: Buffer.from(form.bytes).toString("base64"),
      filename: form.filename,
      contentType: "application/pdf",
      warnings: result.warnings,
    };
  } catch (error) {
    console.error("preview PDF:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "generate_failed",
    };
  }
}

/** Backfill / reconcile kit forms. Custom-only files skip the IRCC kit. */
export async function ensureProjectFormsSeeded(
  organizationId: string,
  projectId: string,
  programFamily: string,
  organizationProgramId?: string | null,
) {
  const supabase = await createClient();
  if (await assertProjectModifiable(supabase, projectId, organizationId)) {
    return;
  }

  const people = await listActiveProjectPeople(supabase, projectId);
  const personIds = people.map((p) => p.id);

  const { syncCustomFormsForParticipants, listProjectCustomForms } =
    await import("@/lib/custom-forms/queries");
  await syncCustomFormsForParticipants({
    organizationId,
    projectId,
    personIds,
    client: supabase,
  });

  if (organizationProgramId) {
    await syncPersonScopedFormsForParticipants({
      organizationId,
      projectId,
      personIds,
    });
    return;
  }

  const { data: existingRows } = await supabase
    .from("project_forms")
    .select("form_code")
    .eq("project_id", projectId)
    .eq("organization_id", organizationId);

  const customForms = await listProjectCustomForms(projectId, supabase);
  if ((existingRows ?? []).length === 0 && customForms.length > 0) {
    return;
  }

  const answersRow = await getProjectFormAnswers(projectId);
  const store = normalizeAnswersStore(answersRow?.answers ?? {}, {
    principalPersonId: people.find((p) => p.role === "principal")?.id,
  });
  const kit = kitOptionsFromAnswersStore(
    store,
    programFamily,
    people.map((p) => p.role),
    (existingRows ?? []).map((r: { form_code: string }) => r.form_code),
  );

  await reconcileProjectKitForms({
    organizationId,
    projectId,
    programFamily,
    personIds,
    applicationLocation: kit.applicationLocation,
    isCommonLaw: kit.isCommonLaw,
    needsCustodian: kit.needsCustodian,
  });
}
