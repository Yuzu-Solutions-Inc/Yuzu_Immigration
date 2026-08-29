"use server";

import { getTranslations } from "next-intl/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { trialExpiredError } from "@/lib/billing/trial";
import { canCreateInWorkspace } from "@/lib/billing/trial";
import { requireOrganizationId } from "@/lib/crm/queries";
import { assertProjectModifiable } from "@/lib/crm/project-lock";
import {
  customFormSchemaSchema,
  emptyCustomFormSchema,
  type CustomFormSchema,
} from "@/lib/custom-forms/schema";
import {
  getCustomFormTemplate,
  getProjectCustomFormAnswers,
  listProjectCustomForms,
  removeProjectCustomForm,
  snapshotCustomFormOntoProject,
  upsertProjectCustomFormAnswers,
} from "@/lib/custom-forms/queries";
import {
  emptyCustomAnswersStore,
  mergeCustomPersonAnswers,
  mergeCustomProjectAnswers,
  normalizeCustomAnswersStore,
  projectScopedKeysFromForms,
} from "@/lib/custom-forms/answers";
import { recordAuditEvent } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";
import {
  getPortalSession,
  assertPortalProjectAccess,
} from "@/lib/portal/auth";
import { createServiceClient } from "@/lib/supabase/admin";
import { listActiveProjectPeople } from "@/lib/ircc/project-forms";

export type CustomFormActionState = {
  error?: string;
  message?: string;
  templateId?: string;
  submittedAt?: string;
};

const localeSchema = z.enum(["en", "fr", "es"]);
const uuidSchema = z.string().uuid();

async function requireWritableMember() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  const locked = trialExpiredError(membership);
  if (locked) return { ok: false as const, error: locked };
  if (!canCreateInWorkspace(membership)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership };
}

function revalidateCatalog(locale: string) {
  revalidatePath(`/${locale}/projects`);
  revalidatePath(`/${locale}/projects/forms`);
  revalidatePath(`/${locale}/projects/templates`);
  revalidatePath(`/${locale}/projects/new`);
}

function parseSchemaJson(raw: string): CustomFormSchema | null {
  try {
    const parsed = customFormSchemaSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function saveCustomFormTemplateAction(
  _prev: CustomFormActionState,
  formData: FormData,
): Promise<CustomFormActionState> {
  const localeParsed = localeSchema.safeParse(formData.get("locale") || "en");
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim();
  const templateIdRaw = String(formData.get("templateId") || "").trim();
  const schema = parseSchemaJson(String(formData.get("schema") || "{}"));
  if (!localeParsed.success || title.length < 1 || title.length > 120 || !schema) {
    return { error: "invalid" };
  }

  const gate = await requireWritableMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  if (templateIdRaw && uuidSchema.safeParse(templateIdRaw).success) {
    const { data, error } = await supabase
      .from("custom_form_templates")
      .update({
        title,
        description: description || null,
        schema,
        updated_at: new Date().toISOString(),
      })
      .eq("id", templateIdRaw)
      .eq("organization_id", orgId)
      .select("id")
      .maybeSingle();
    if (error || !data) {
      console.error("update custom form template:", error?.message);
      return { error: "save_failed" };
    }
    await recordAuditEvent({
      organizationId: orgId,
      actorUserId: user?.id ?? null,
      actorKind: "staff",
      action: "custom_form_template.update",
      resourceType: "custom_form_template",
      resourceId: templateIdRaw,
      metadata: { title },
    });
    revalidateCatalog(localeParsed.data);
    return { message: "saved", templateId: templateIdRaw };
  }

  const { data, error } = await supabase
    .from("custom_form_templates")
    .insert({
      organization_id: orgId,
      title,
      description: description || null,
      schema,
      is_active: true,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("create custom form template:", error?.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id ?? null,
    actorKind: "staff",
    action: "custom_form_template.create",
    resourceType: "custom_form_template",
    resourceId: data.id as string,
    metadata: { title },
  });
  revalidateCatalog(localeParsed.data);
  redirect(`/${localeParsed.data}/projects/forms/${data.id}/edit`);
}

export async function createBlankCustomFormTemplateAction(
  locale: string,
): Promise<CustomFormActionState> {
  const localeParsed = localeSchema.safeParse(locale);
  if (!localeParsed.success) return { error: "invalid" };
  const gate = await requireWritableMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const t = await getTranslations("customForms");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_form_templates")
    .insert({
      organization_id: orgId,
      title: t("untitledForm"),
      schema: emptyCustomFormSchema(),
      is_active: true,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("create blank custom form:", error?.message);
    return { error: "save_failed" };
  }
  redirect(`/${localeParsed.data}/projects/forms/${data.id}/edit`);
}

export async function deleteCustomFormTemplateAction(
  _prev: CustomFormActionState,
  formData: FormData,
): Promise<CustomFormActionState> {
  const templateId = String(formData.get("templateId") || "");
  const localeParsed = localeSchema.safeParse(formData.get("locale") || "en");
  if (!uuidSchema.safeParse(templateId).success || !localeParsed.success) {
    return { error: "invalid" };
  }
  const gate = await requireWritableMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("custom_form_templates")
    .delete()
    .eq("id", templateId)
    .eq("organization_id", orgId)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("delete custom form template:", error.message);
    return { error: "save_failed" };
  }
  if (!data) return { error: "not_found" };
  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id ?? null,
    actorKind: "staff",
    action: "custom_form_template.delete",
    resourceType: "custom_form_template",
    resourceId: templateId,
  });
  revalidateCatalog(localeParsed.data);
  redirect(`/${localeParsed.data}/projects/forms`);
}

export async function addCustomFormToProjectAction(
  _prev: CustomFormActionState,
  formData: FormData,
): Promise<CustomFormActionState> {
  const projectId = String(formData.get("projectId") || "");
  const templateId = String(formData.get("templateId") || "");
  const scopeRaw = String(formData.get("scope") || "person");
  const locale = String(formData.get("locale") || "en");
  const scope = scopeRaw === "project" ? "project" : "person";
  if (
    !uuidSchema.safeParse(projectId).success ||
    !uuidSchema.safeParse(templateId).success
  ) {
    return { error: "invalid" };
  }
  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };
  const supabase = await createClient();
  if (await assertProjectModifiable(supabase, projectId, orgId)) {
    return { error: "granted" };
  }
  const template = await getCustomFormTemplate(orgId, templateId);
  if (!template) return { error: "not_found" };
  const people = await listActiveProjectPeople(supabase, projectId);
  try {
    await snapshotCustomFormOntoProject({
      organizationId: orgId,
      projectId,
      template,
      scope,
      personIds: people.map((p) => p.id),
    });
    const existing = await getProjectCustomFormAnswers(projectId);
    if (!existing) {
      await upsertProjectCustomFormAnswers({
        organizationId: orgId,
        projectId,
        answers: emptyCustomAnswersStore(),
      });
    }
  } catch (error) {
    console.error("add custom form:", error);
    return { error: "save_failed" };
  }
  revalidatePath(`/${locale}/projects/${projectId}`);
  revalidatePath(`/${locale}/projects/${projectId}/forms`);
  return { message: "added" };
}

export async function removeCustomFormFromProjectAction(
  _prev: CustomFormActionState,
  formData: FormData,
): Promise<CustomFormActionState> {
  const projectId = String(formData.get("projectId") || "");
  const formId = String(formData.get("formId") || "");
  const locale = String(formData.get("locale") || "en");
  if (
    !uuidSchema.safeParse(projectId).success ||
    !uuidSchema.safeParse(formId).success
  ) {
    return { error: "invalid" };
  }
  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };
  const supabase = await createClient();
  if (await assertProjectModifiable(supabase, projectId, orgId)) {
    return { error: "granted" };
  }
  try {
    await removeProjectCustomForm({ organizationId: orgId, projectId, formId });
  } catch {
    return { error: "save_failed" };
  }
  revalidatePath(`/${locale}/projects/${projectId}`);
  revalidatePath(`/${locale}/projects/${projectId}/forms`);
  return { message: "removed" };
}

async function saveCustomAnswersForProject(input: {
  organizationId: string;
  projectId: string;
  personId: string | null;
  answers: Record<string, unknown>;
  currentSection?: string | null;
  submit?: boolean;
  client?: Awaited<ReturnType<typeof createClient>> | ReturnType<typeof createServiceClient>;
}) {
  const forms = await listProjectCustomForms(input.projectId, input.client);
  const existing = await getProjectCustomFormAnswers(
    input.projectId,
    input.client,
  );
  const store = existing?.answers ?? emptyCustomAnswersStore();
  const projectKeys = projectScopedKeysFromForms(forms);
  const next = input.personId
    ? mergeCustomPersonAnswers(store, input.personId, input.answers, projectKeys)
    : mergeCustomProjectAnswers(store, input.answers);
  await upsertProjectCustomFormAnswers({
    organizationId: input.organizationId,
    projectId: input.projectId,
    answers: next,
    currentSection: input.currentSection ?? null,
    submittedAt: input.submit ? new Date().toISOString() : undefined,
    client: input.client,
  });
}

export async function saveProjectCustomAnswersAction(
  _prev: CustomFormActionState,
  formData: FormData,
): Promise<CustomFormActionState> {
  const projectId = String(formData.get("projectId") || "");
  const personIdRaw = String(formData.get("personId") || "");
  const locale = String(formData.get("locale") || "en");
  const currentSection = String(formData.get("currentSection") || "");
  let answers: unknown = {};
  try {
    answers = JSON.parse(String(formData.get("answers") || "{}"));
  } catch {
    return { error: "invalid" };
  }
  if (!uuidSchema.safeParse(projectId).success || !answers || typeof answers !== "object") {
    return { error: "invalid" };
  }
  const personId =
    personIdRaw && uuidSchema.safeParse(personIdRaw).success ? personIdRaw : null;
  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };
  const supabase = await createClient();
  if (await assertProjectModifiable(supabase, projectId, orgId)) {
    return { error: "granted" };
  }
  try {
    await saveCustomAnswersForProject({
      organizationId: orgId,
      projectId,
      personId,
      answers: answers as Record<string, unknown>,
      currentSection,
    });
  } catch {
    return { error: "save_failed" };
  }
  revalidatePath(`/${locale}/projects/${projectId}`);
  revalidatePath(`/${locale}/projects/${projectId}/forms`);
  return { message: "saved" };
}

export async function savePortalCustomAnswersAction(
  _prev: CustomFormActionState,
  formData: FormData,
): Promise<CustomFormActionState> {
  const session = await getPortalSession();
  if (!session) return { error: "unauthorized" };
  const projectId = String(formData.get("projectId") || "");
  const personIdRaw = String(formData.get("personId") || "");
  const currentSection = String(formData.get("currentSection") || "");
  let answers: unknown = {};
  try {
    answers = JSON.parse(String(formData.get("answers") || "{}"));
  } catch {
    return { error: "invalid" };
  }
  if (!uuidSchema.safeParse(projectId).success) return { error: "invalid" };
  try {
    await assertPortalProjectAccess(session, projectId);
  } catch {
    return { error: "unauthorized" };
  }
  const personId =
    personIdRaw && uuidSchema.safeParse(personIdRaw).success
      ? personIdRaw
      : session.personId;
  const admin = createServiceClient();
  try {
    await saveCustomAnswersForProject({
      organizationId: session.organizationId,
      projectId,
      personId,
      answers: answers as Record<string, unknown>,
      currentSection,
      client: admin,
    });
  } catch {
    return { error: "save_failed" };
  }
  return { message: "saved" };
}

export async function submitPortalCustomQuestionnaireAction(
  _prev: CustomFormActionState,
  formData: FormData,
): Promise<CustomFormActionState> {
  const session = await getPortalSession();
  if (!session) return { error: "unauthorized" };
  const projectId = String(formData.get("projectId") || "");
  const personIdRaw = String(formData.get("personId") || "");
  const currentSection = String(formData.get("currentSection") || "");
  let answers: unknown = {};
  try {
    answers = JSON.parse(String(formData.get("answers") || "{}"));
  } catch {
    return { error: "invalid" };
  }
  if (!uuidSchema.safeParse(projectId).success) return { error: "invalid" };
  try {
    await assertPortalProjectAccess(session, projectId);
  } catch {
    return { error: "unauthorized" };
  }
  const personId =
    personIdRaw && uuidSchema.safeParse(personIdRaw).success
      ? personIdRaw
      : session.personId;
  const admin = createServiceClient();
  const submittedAt = new Date().toISOString();
  try {
    await saveCustomAnswersForProject({
      organizationId: session.organizationId,
      projectId,
      personId,
      answers: answers as Record<string, unknown>,
      currentSection,
      submit: true,
      client: admin,
    });
  } catch {
    return { error: "save_failed" };
  }
  return { message: "submitted", submittedAt };
}

export async function loadCustomFormTemplateForEdit(templateId: string) {
  const membership = await getPrimaryMembership();
  if (!membership) return null;
  return getCustomFormTemplate(membership.organization.id, templateId);
}
