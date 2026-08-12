"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isFormCode, isPersonScopedForm } from "@/lib/ircc/catalog";
import {
  answersForPersonFill,
  mergePersonQuestionnaireSave,
  normalizeAnswersStore,
} from "@/lib/ircc/answers-store";
import { fillProjectForms, zipFilledForms } from "@/lib/ircc/fill-project";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import {
  mergeAccountRepIntoAnswers,
  PROFILE_REP_SELECT,
} from "@/lib/ircc/account-rep";
import {
  PROJECT_SCOPED_ANSWER_KEYS,
  SHARE_LINK_TTL_DAYS,
  addProjectForm,
  getProjectFormAnswers,
  kitOptionsFromAnswersStore,
  listActiveProjectPeople,
  listProjectForms,
  reconcileProjectKitForms,
  saveShareAnswers,
  upsertProjectFormAnswers,
} from "@/lib/ircc/project-forms";
import { requireOrganizationId } from "@/lib/crm/queries";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { getAppBaseUrl } from "@/lib/app-url";

export type FormsActionState = {
  error?: string;
  message?: string;
  shareUrl?: string;
  expiresAt?: string;
  warnings?: string[];
};

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
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
    });
  } catch {
    return { error: "save_failed" };
  }

  revalidatePath(`/${locale}/projects/${projectId}`);
  revalidatePath(`/${locale}/projects/${projectId}/forms`);
  return { message: "saved" };
}

export async function saveShareAnswersAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const token = String(formData.get("token") || "");
  const personId = String(formData.get("personId") || "");
  const currentSection = String(formData.get("currentSection") || "") || null;
  const answersRaw = String(formData.get("answers") || "{}");

  if (!token || !z.string().uuid().safeParse(personId).success) {
    return { error: "invalid" };
  }

  let answers: Record<string, unknown>;
  try {
    answers = JSON.parse(answersRaw) as Record<string, unknown>;
  } catch {
    return { error: "invalid" };
  }

  answers.hasRepresentative = "Y";

  try {
    await saveShareAnswers({ token, personId, answers, currentSection });
  } catch (error) {
    if (error instanceof Error && error.message === "expired") {
      return { error: "expired" };
    }
    return { error: "save_failed" };
  }

  return { message: "saved" };
}

export async function createFormShareLinkAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const locale = String(formData.get("locale") || "en");

  if (!z.string().uuid().safeParse(projectId).success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const user = await getSessionUser();
  const supabase = await createClient();

  await supabase
    .from("form_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .is("revoked_at", null);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(
    Date.now() + SHARE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("form_share_links").insert({
    organization_id: orgId,
    project_id: projectId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
    created_by: user?.id ?? null,
  });

  if (error) {
    console.error("create share link:", error.message);
    return { error: "share_failed" };
  }

  const base = await getAppBaseUrl();
  const shareUrl = `${base}/${locale}/fill/${token}`;

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "shared", shareUrl, expiresAt };
}

export async function revokeFormShareLinkAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const projectId = String(formData.get("projectId") || "");
  const locale = String(formData.get("locale") || "en");

  if (!z.string().uuid().safeParse(projectId).success) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const supabase = await createClient();
  await supabase
    .from("form_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .is("revoked_at", null);

  revalidatePath(`/${locale}/projects/${projectId}`);
  return { message: "revoked" };
}

export async function generateProjectPdfsAction(
  projectId: string,
  locale: string,
  formIdOrCode?: string,
): Promise<
  | {
      ok: true;
      base64: string;
      filename: string;
      contentType: string;
      warnings: string[];
    }
  | { ok: false; error: string }
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

  try {
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

    const result = await fillProjectForms({ instances });

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

/** Backfill / reconcile kit forms (always includes IMM 5476). */
export async function ensureProjectFormsSeeded(
  organizationId: string,
  projectId: string,
  programFamily: string,
) {
  const supabase = await createClient();
  const people = await listActiveProjectPeople(supabase, projectId);
  const personIds = people.map((p) => p.id);
  const answersRow = await getProjectFormAnswers(projectId);
  const store = normalizeAnswersStore(answersRow?.answers ?? {}, {
    principalPersonId: people.find((p) => p.role === "principal")?.id,
  });
  const { data: existingRows } = await supabase
    .from("project_forms")
    .select("form_code")
    .eq("project_id", projectId)
    .eq("organization_id", organizationId);
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
  });
}

export async function adminLoadShareProject(token: string) {
  const { loadShareContext } = await import("@/lib/ircc/project-forms");
  return loadShareContext(token);
}

/** Used when staff want service-role download after generate — unused for now. */
export async function _touchShareWithService(tokenHash: string) {
  const admin = createServiceClient();
  await admin
    .from("form_share_links")
    .select("id")
    .eq("token_hash", tokenHash)
    .limit(1);
}
