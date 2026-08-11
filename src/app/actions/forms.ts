"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { isFormCode } from "@/lib/ircc/catalog";
import { fillProjectForms, zipFilledForms } from "@/lib/ircc/fill-project";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import {
  SHARE_LINK_TTL_DAYS,
  addProjectForm,
  getProjectFormAnswers,
  listProjectForms,
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
  const locale = String(formData.get("locale") || "en");

  if (!z.string().uuid().safeParse(projectId).success || !isFormCode(formCode)) {
    return { error: "invalid" };
  }

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  try {
    await addProjectForm({
      organizationId: orgId,
      projectId,
      formCode,
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
  const locale = String(formData.get("locale") || "en");
  const currentSection = String(formData.get("currentSection") || "") || null;
  const answersRaw = String(formData.get("answers") || "{}");

  if (!z.string().uuid().safeParse(projectId).success) {
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
  const { data: project } = await supabase
    .from("immigration_projects")
    .select("form_language, representative_user_id")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  const {
    mergeAccountRepIntoAnswers,
    PROFILE_REP_SELECT,
  } = await import("@/lib/ircc/account-rep");
  const repUserId = project?.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await supabase
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  answers.hasRepresentative = "Y";
  answers = withProjectFormLanguage(
    mergeAccountRepIntoAnswers(answers, repProfile),
    project?.form_language,
  );

  try {
    await upsertProjectFormAnswers({
      organizationId: orgId,
      projectId,
      answers,
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
      .eq("status", "todo");
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
  const currentSection = String(formData.get("currentSection") || "") || null;
  const answersRaw = String(formData.get("answers") || "{}");

  if (!token) return { error: "invalid" };

  let answers: Record<string, unknown>;
  try {
    answers = JSON.parse(answersRaw) as Record<string, unknown>;
  } catch {
    return { error: "invalid" };
  }

  answers.hasRepresentative = "Y";

  try {
    await saveShareAnswers({ token, answers, currentSection });
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

  // Revoke existing active links — data is kept; only the URL dies.
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
  formCode?: string,
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
  const [forms, answersRow, project] = await Promise.all([
    listProjectForms(projectId),
    getProjectFormAnswers(projectId),
    supabase
      .from("immigration_projects")
      .select("form_language, representative_user_id")
      .eq("id", projectId)
      .eq("organization_id", orgId)
      .maybeSingle()
      .then(({ data }) => data),
  ]);

  if (forms.length === 0) {
    return { ok: false, error: "no_forms" };
  }

  const requestedCode = formCode?.trim().toLowerCase();
  if (requestedCode) {
    if (!isFormCode(requestedCode)) {
      return { ok: false, error: "invalid" };
    }
    if (!forms.some((f) => f.form_code === requestedCode)) {
      return { ok: false, error: "invalid" };
    }
  }

  const formCodes = requestedCode
    ? [requestedCode]
    : forms.map((f) => f.form_code);

  try {
    const {
      mergeAccountRepIntoAnswers,
      PROFILE_REP_SELECT,
    } = await import("@/lib/ircc/account-rep");
    const repUserId = project?.representative_user_id as string | null;
    const { data: repProfile } = repUserId
      ? await supabase
          .from("profiles")
          .select(PROFILE_REP_SELECT)
          .eq("id", repUserId)
          .maybeSingle()
      : { data: null };

    const answers = withProjectFormLanguage(
      mergeAccountRepIntoAnswers(answersRow?.answers ?? {}, repProfile),
      project?.form_language,
    );
    const result = await fillProjectForms({
      formCodes,
      answers,
    });

    await supabase
      .from("project_forms")
      .update({
        status: "generated",
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("project_id", projectId)
      .eq("organization_id", orgId)
      .in(
        "form_code",
        result.forms.map((f) => f.code),
      );

    revalidatePath(`/${locale}/projects/${projectId}`);

    if (requestedCode && result.forms.length === 1) {
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

/** Backfill forms for existing projects missing a kit (always includes IMM 5476). */
export async function ensureProjectFormsSeeded(
  organizationId: string,
  projectId: string,
  programFamily: string,
) {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("project_forms")
    .select("id")
    .eq("project_id", projectId)
    .limit(1);

  if (existing && existing.length > 0) return;

  const { seedFormsForProgram } = await import("@/lib/ircc/kits");
  const seeds = seedFormsForProgram(programFamily as never);
  await supabase.from("project_forms").insert(
    seeds.map((seed) => ({
      organization_id: organizationId,
      project_id: projectId,
      form_code: seed.formCode,
      is_required: seed.isRequired,
      sort_order: seed.sortOrder,
      status: "todo",
    })),
  );
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
