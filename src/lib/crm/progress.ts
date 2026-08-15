import {
  answersForPersonFill,
  normalizeAnswersStore,
} from "@/lib/ircc/answers-store";
import { questionnaireFillCounts } from "@/lib/ircc/form-readiness";
import { requireOrganizationId } from "@/lib/crm/queries";
import { decryptAnswersValue } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProjectProgress = {
  docsDone: number;
  docsTotal: number;
  formPercent: number;
  docsToReview: number;
};

type DocRow = { project_id: string; status: string; is_required: boolean };
type FormProgressRow = {
  form_code: string;
  person_id: string | null;
  is_required: boolean;
};
type FormRow = FormProgressRow & { project_id: string };
type AnswerRow = { project_id: string; answers: unknown };
type ParticipantRow = {
  project_id: string;
  person_id: string;
  role: string;
};

const EMPTY: ProjectProgress = {
  docsDone: 0,
  docsTotal: 0,
  formPercent: 0,
  docsToReview: 0,
};

function isDocSubmitted(status: string) {
  return status === "uploaded" || status === "accepted";
}

function formPercentForProject(
  forms: FormProgressRow[],
  answers: unknown,
  principalPersonId: string | null,
): number {
  const required = forms.filter((form) => form.is_required);
  if (required.length === 0) return 0;

  const store = normalizeAnswersStore(answers ?? {}, { principalPersonId });
  const codesByPerson = new Map<string, string[]>();

  for (const form of required) {
    const personId = form.person_id ?? principalPersonId ?? "__project__";
    const codes = codesByPerson.get(personId) ?? [];
    codes.push(form.form_code);
    codesByPerson.set(personId, codes);
  }

  let filled = 0;
  let total = 0;
  for (const [personId, codes] of codesByPerson) {
    const bag = answersForPersonFill(
      store,
      personId === "__project__" ? null : personId,
    );
    const counts = questionnaireFillCounts(codes, bag);
    filled += counts.filled;
    total += counts.total;
  }

  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}

export async function getProjectsProgress(
  projectIds: string[],
): Promise<Map<string, ProjectProgress>> {
  const orgId = await requireOrganizationId();
  if (!orgId) return new Map();
  return getProjectsProgressForOrg(orgId, projectIds, await createClient());
}

/** Form completion % for project ids (bypasses RLS via service role). */
export async function formPercentForProjectIds(
  organizationId: string,
  projectIds: string[],
): Promise<Map<string, number>> {
  const full = await getProjectsProgressForOrg(
    organizationId,
    projectIds,
    createServiceClient(),
  );
  const map = new Map<string, number>();
  for (const [id, stats] of full) {
    map.set(id, stats.formPercent);
  }
  return map;
}

async function getProjectsProgressForOrg(
  orgId: string,
  projectIds: string[],
  supabase: SupabaseClient,
): Promise<Map<string, ProjectProgress>> {
  const progress = new Map<string, ProjectProgress>();
  if (projectIds.length === 0) return progress;

  const key = await getOrgDataKey(orgId);

  const [docsResult, formsResult, answersResult, participantsResult] =
    await Promise.all([
      supabase
        .from("project_document_requests")
        .select("project_id, status, is_required")
        .eq("organization_id", orgId)
        .in("project_id", projectIds)
        .eq("is_required", true)
        .limit(5000),
      supabase
        .from("project_forms")
        .select("project_id, form_code, person_id, is_required")
        .eq("organization_id", orgId)
        .in("project_id", projectIds)
        .eq("is_required", true)
        .limit(5000),
      supabase
        .from("project_form_answers")
        .select("project_id, answers")
        .eq("organization_id", orgId)
        .in("project_id", projectIds)
        .limit(500),
      supabase
        .from("project_participants")
        .select("project_id, person_id, role")
        .eq("organization_id", orgId)
        .in("project_id", projectIds)
        .is("left_at", null)
        .limit(2000),
    ]);

  if (docsResult.error) {
    console.error("getProjectsProgress docs:", docsResult.error.message);
  }
  if (formsResult.error) {
    console.error("getProjectsProgress forms:", formsResult.error.message);
  }
  if (answersResult.error) {
    console.error("getProjectsProgress answers:", answersResult.error.message);
  }
  if (participantsResult.error) {
    console.error(
      "getProjectsProgress participants:",
      participantsResult.error.message,
    );
  }

  const docsByProject = new Map<
    string,
    { done: number; total: number; toReview: number }
  >();
  for (const row of (docsResult.data ?? []) as DocRow[]) {
    const current = docsByProject.get(row.project_id) ?? {
      done: 0,
      total: 0,
      toReview: 0,
    };
    current.total += 1;
    if (isDocSubmitted(row.status)) current.done += 1;
    if (row.status === "uploaded") current.toReview += 1;
    docsByProject.set(row.project_id, current);
  }

  const formsByProject = new Map<string, FormRow[]>();
  for (const row of (formsResult.data ?? []) as FormRow[]) {
    const list = formsByProject.get(row.project_id) ?? [];
    list.push(row);
    formsByProject.set(row.project_id, list);
  }

  const answersByProject = new Map<string, unknown>();
  for (const row of (answersResult.data ?? []) as AnswerRow[]) {
    answersByProject.set(row.project_id, decryptAnswersValue(row.answers, key));
  }

  const principalByProject = new Map<string, string>();
  for (const row of (participantsResult.data ?? []) as ParticipantRow[]) {
    if (row.role === "principal" && !principalByProject.has(row.project_id)) {
      principalByProject.set(row.project_id, row.person_id);
    }
  }

  for (const projectId of projectIds) {
    const docs = docsByProject.get(projectId);
    progress.set(projectId, {
      docsDone: docs?.done ?? 0,
      docsTotal: docs?.total ?? 0,
      docsToReview: docs?.toReview ?? 0,
      formPercent: formPercentForProject(
        formsByProject.get(projectId) ?? [],
        answersByProject.get(projectId) ?? {},
        principalByProject.get(projectId) ?? null,
      ),
    });
  }

  return progress;
}

export function emptyProjectProgress(): ProjectProgress {
  return { ...EMPTY };
}

type DetailDocRow = { status: string; is_required: boolean };
type DetailFormRow = FormProgressRow;

/** Progress from data already loaded on the project detail page. */
export function computeProjectProgressFromDetail(
  documentRequests: DetailDocRow[],
  forms: DetailFormRow[],
  answers: unknown,
  principalPersonId: string | null,
): ProjectProgress {
  const requiredDocs = documentRequests.filter((row) => row.is_required);
  const docsDone = requiredDocs.filter((row) =>
    isDocSubmitted(row.status),
  ).length;
  const docsToReview = requiredDocs.filter(
    (row) => row.status === "uploaded",
  ).length;

  return {
    docsDone,
    docsTotal: requiredDocs.length,
    docsToReview,
    formPercent: formPercentForProject(
      forms,
      answers,
      principalPersonId,
    ),
  };
}
