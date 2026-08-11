import { createHash, randomBytes } from "node:crypto";

import type { ProgramFamily } from "@/db/schema";
import { seedFormsForProgram } from "@/lib/ircc/kits";
import type { FormCode } from "@/lib/ircc/catalog";
import { isFormCode } from "@/lib/ircc/catalog";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import {
  mergeAccountRepIntoAnswers,
  PROFILE_REP_SELECT,
} from "@/lib/ircc/account-rep";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export const SHARE_LINK_TTL_DAYS = 30;

export type ProjectFormRow = {
  id: string;
  organization_id: string;
  project_id: string;
  form_code: string;
  status: "todo" | "in_progress" | "ready" | "generated";
  is_required: boolean;
  sort_order: number;
  generated_storage_path: string | null;
  generated_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectFormAnswersRow = {
  id: string;
  organization_id: string;
  project_id: string;
  answers: Record<string, unknown>;
  current_section: string | null;
  created_at: string;
  updated_at: string;
};

export type FormShareLinkRow = {
  id: string;
  organization_id: string;
  project_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_by: string | null;
  last_accessed_at: string | null;
  created_at: string;
};

export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function generateShareToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function seedProjectForms(
  organizationId: string,
  projectId: string,
  programFamily: ProgramFamily,
  options?: { applicationLocation?: "outside" | "inside" },
) {
  const supabase = await createClient();
  const seeds = seedFormsForProgram(programFamily, options);
  const { error } = await supabase.from("project_forms").insert(
    seeds.map((seed) => ({
      organization_id: organizationId,
      project_id: projectId,
      form_code: seed.formCode,
      is_required: seed.isRequired,
      sort_order: seed.sortOrder,
      status: "todo",
    })),
  );
  if (error) {
    console.error("seedProjectForms:", error.message);
    throw new Error(error.message);
  }
}

export async function listProjectForms(
  projectId: string,
): Promise<ProjectFormRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_forms")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("listProjectForms:", error.message);
    return [];
  }
  return (data ?? []) as ProjectFormRow[];
}

export async function getProjectFormAnswers(
  projectId: string,
): Promise<ProjectFormAnswersRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("project_form_answers")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error("getProjectFormAnswers:", error.message);
    return null;
  }
  return data as ProjectFormAnswersRow | null;
}

export async function upsertProjectFormAnswers(input: {
  organizationId: string;
  projectId: string;
  answers: Record<string, unknown>;
  currentSection?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("project_form_answers").upsert(
    {
      organization_id: input.organizationId,
      project_id: input.projectId,
      answers: input.answers,
      current_section: input.currentSection ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) {
    console.error("upsertProjectFormAnswers:", error.message);
    throw new Error(error.message);
  }
}

export async function addProjectForm(input: {
  organizationId: string;
  projectId: string;
  formCode: FormCode;
  isRequired?: boolean;
}) {
  if (!isFormCode(input.formCode)) {
    throw new Error("Invalid form code");
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("project_forms")
    .select("sort_order")
    .eq("project_id", input.projectId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sortOrder = ((existing?.sort_order as number | undefined) ?? 0) + 10;
  const { error } = await supabase.from("project_forms").insert({
    organization_id: input.organizationId,
    project_id: input.projectId,
    form_code: input.formCode,
    is_required: input.isRequired ?? false,
    sort_order: sortOrder,
    status: "todo",
  });
  if (error) {
    console.error("addProjectForm:", error.message);
    throw new Error(error.message);
  }
}

export async function getActiveShareLink(
  projectId: string,
): Promise<FormShareLinkRow | null> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("form_share_links")
    .select("*")
    .eq("project_id", projectId)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("getActiveShareLink:", error.message);
    return null;
  }
  return data as FormShareLinkRow | null;
}

/** Resolve a client share token via service role (no staff session). */
export async function resolveShareToken(token: string): Promise<{
  organizationId: string;
  projectId: string;
  linkId: string;
  expiresAt: string;
} | null> {
  const hash = hashShareToken(token);
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("form_share_links")
    .select("id, organization_id, project_id, expires_at, revoked_at")
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  await admin
    .from("form_share_links")
    .update({ last_accessed_at: new Date().toISOString() })
    .eq("id", data.id);

  return {
    organizationId: data.organization_id as string,
    projectId: data.project_id as string,
    linkId: data.id as string,
    expiresAt: data.expires_at as string,
  };
}

export async function loadShareContext(token: string) {
  const resolved = await resolveShareToken(token);
  if (!resolved) return null;

  const admin = createServiceClient();
  const [projectRes, formsRes, answersRes, orgRes] = await Promise.all([
    admin
      .from("immigration_projects")
      .select(
        "id, title, program_family, organization_id, form_language, representative_user_id",
      )
      .eq("id", resolved.projectId)
      .maybeSingle(),
    admin
      .from("project_forms")
      .select("*")
      .eq("project_id", resolved.projectId)
      .order("sort_order", { ascending: true }),
    admin
      .from("project_form_answers")
      .select("*")
      .eq("project_id", resolved.projectId)
      .maybeSingle(),
    admin
      .from("organizations")
      .select("id, name")
      .eq("id", resolved.organizationId)
      .maybeSingle(),
  ]);

  const loadError =
    projectRes.error || formsRes.error || answersRes.error || orgRes.error;
  if (loadError) {
    console.error("loadShareContext:", loadError.message);
    throw new Error(`share_context_failed: ${loadError.message}`);
  }

  if (!projectRes.data) return null;

  const repUserId = projectRes.data.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await admin
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  return {
    ...resolved,
    project: projectRes.data,
    forms: (formsRes.data ?? []) as ProjectFormRow[],
    answers: withProjectFormLanguage(
      mergeAccountRepIntoAnswers(
        (answersRes.data?.answers ?? {}) as Record<string, unknown>,
        repProfile,
      ),
      projectRes.data.form_language,
    ),
    currentSection:
      (answersRes.data?.current_section as string | null) ?? null,
    organization: orgRes.data,
  };
}

export async function saveShareAnswers(input: {
  token: string;
  answers: Record<string, unknown>;
  currentSection?: string | null;
}) {
  const resolved = await resolveShareToken(input.token);
  if (!resolved) {
    throw new Error("expired");
  }
  const admin = createServiceClient();
  const { data: project } = await admin
    .from("immigration_projects")
    .select("form_language, representative_user_id")
    .eq("id", resolved.projectId)
    .maybeSingle();

  const repUserId = project?.representative_user_id as string | null;
  const { data: repProfile } = repUserId
    ? await admin
        .from("profiles")
        .select(PROFILE_REP_SELECT)
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  const answers = withProjectFormLanguage(
    mergeAccountRepIntoAnswers(input.answers, repProfile),
    project?.form_language,
  );

  const { error } = await admin.from("project_form_answers").upsert(
    {
      organization_id: resolved.organizationId,
      project_id: resolved.projectId,
      answers,
      current_section: input.currentSection ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "project_id" },
  );
  if (error) throw new Error(error.message);
}
