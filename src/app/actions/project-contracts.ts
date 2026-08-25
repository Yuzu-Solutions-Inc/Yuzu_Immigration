"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { trialExpiredError } from "@/lib/billing/trial";
import { sanitizeContractHtml } from "@/lib/contracts/html";
import {
  createProjectContractFromTemplate,
  getActiveProjectContract,
  issueProjectContract,
  listProjectContractFiles,
  requestProjectContractSignature,
  supersedeAndCreateProjectContractVersion,
} from "@/lib/contracts/project-contracts";
import {
  hasContractCopy,
  parseContractTranslations,
  type ContractTranslations,
} from "@/lib/contracts/translations";
import { MAX_CONTRACT_HTML_CHARS } from "@/lib/contracts/types";
import { voidOpenContractsForProject } from "@/lib/contracts/issue-project";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import { createClient } from "@/lib/supabase/server";

export type ProjectContractActionState = {
  error?: string;
  message?: string;
};

async function requireStaff() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  const locked = trialExpiredError(membership);
  if (locked) return { ok: false as const, error: locked };
  return { ok: true as const, membership };
}

function resolveTranslations(
  raw: string,
  orgDefault: AppLocale,
  fallbackHtml: string,
):
  | { ok: true; translations: ContractTranslations; bodyHtml: string }
  | { ok: false; error: "invalid" | "missing_default_locale" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid" };
  }
  const translations = parseContractTranslations(parsed);
  if (
    !hasContractCopy(translations[orgDefault]) &&
    hasContractCopy(fallbackHtml)
  ) {
    translations[orgDefault] = sanitizeContractHtml(fallbackHtml);
  }
  const bodyHtml = translations[orgDefault];
  if (!hasContractCopy(bodyHtml) || !bodyHtml) {
    return { ok: false, error: "missing_default_locale" };
  }
  return { ok: true, translations, bodyHtml };
}

export async function loadProjectContractContext(projectId: string) {
  const [contract, files] = await Promise.all([
    getActiveProjectContract(projectId),
    listProjectContractFiles(projectId),
  ]);

  let formTitle: string | null = null;
  let formFields: Array<{
    field_key: string;
    label: string;
    form_id: string;
  }> = [];
  let envelopeId: string | null = null;
  let clientSigned = false;
  let needsConsultantSign = false;
  let consultantExpectedName: string | null = null;

  const supabase = await createClient();

  if (contract?.form_id) {
    const [{ data: form }, { data: fields }] = await Promise.all([
      supabase
        .from("booking_forms")
        .select("id, title")
        .eq("id", contract.form_id)
        .maybeSingle(),
      supabase
        .from("booking_service_form_fields")
        .select("field_key, label, form_id")
        .eq("form_id", contract.form_id)
        .order("sort_order", { ascending: true }),
    ]);
    formTitle = (form?.title as string | null) ?? null;
    formFields = (fields ?? []).map((field) => ({
      field_key: field.field_key as string,
      label: field.label as string,
      form_id: field.form_id as string,
    }));
  }

  if (contract && contract.status === "pending_signature") {
    const { data: envelope } = await supabase
      .from("contract_envelopes")
      .select("id, organization_id")
      .eq("project_contract_id", contract.id)
      .in("status", ["sent", "viewed", "partially_signed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (envelope) {
      envelopeId = envelope.id as string;
      const { data: signers } = await supabase
        .from("contract_signers")
        .select("role, status, full_name")
        .eq("envelope_id", envelope.id);
      const { getOrgDataKey } = await import("@/lib/security/org-data-key");
      const { decryptContractSignerRow } = await import(
        "@/lib/security/client-pii"
      );
      const dek = await getOrgDataKey(envelope.organization_id as string);
      for (const row of signers ?? []) {
        const decrypted = decryptContractSignerRow(row, dek);
        if (row.role === "client") {
          clientSigned = row.status === "signed";
        }
        if (row.role === "consultant") {
          needsConsultantSign =
            row.status === "pending" || row.status === "viewed";
          consultantExpectedName =
            (decrypted.full_name as string | null)?.trim() || null;
        }
      }
    }
  }

  return {
    contract,
    files,
    formTitle,
    formFields,
    envelopeId,
    clientSigned,
    needsConsultantSign,
    consultantExpectedName,
  };
}

export async function saveProjectContractAction(
  _prev: ProjectContractActionState,
  formData: FormData,
): Promise<ProjectContractActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const schema = z.object({
    locale: z.enum(["en", "fr", "es"]),
    projectId: z.string().uuid(),
    contractId: z.string().uuid(),
    title: z.string().trim().min(1).max(120),
    bodyHtml: z.string().max(MAX_CONTRACT_HTML_CHARS),
    translations: z.string().max(MAX_CONTRACT_HTML_CHARS * 4),
  });
  const parsed = schema.safeParse({
    locale: formData.get("locale") || "en",
    projectId: formData.get("projectId"),
    contractId: formData.get("contractId"),
    title: formData.get("title"),
    bodyHtml: formData.get("bodyHtml"),
    translations: formData.get("translations"),
  });
  if (!parsed.success) return { error: "invalid" };

  const orgDefault = auth.membership.organization.defaultLocale;
  const copy = resolveTranslations(
    parsed.data.translations,
    orgDefault,
    parsed.data.bodyHtml,
  );
  if (!copy.ok) return { error: copy.error };

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("immigration_projects")
    .select("organization_id")
    .eq("id", parsed.data.projectId)
    .eq("organization_id", auth.membership.organization.id)
    .maybeSingle();
  if (!project) return { error: "forbidden" };

  try {
    await supersedeAndCreateProjectContractVersion(parsed.data.contractId, {
      title: parsed.data.title,
      bodyHtml: copy.bodyHtml,
      translations: copy.translations,
    });
  } catch {
    return { error: "save_failed" };
  }

  revalidatePath(`/${parsed.data.locale}/projects/${parsed.data.projectId}`);
  return { message: "saved" };
}

export async function sendProjectContractAction(
  _prev: ProjectContractActionState,
  formData: FormData,
): Promise<ProjectContractActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const schema = z.object({
    locale: z.enum(["en", "fr", "es"]),
    projectId: z.string().uuid(),
    contractId: z.string().uuid(),
  });
  const parsed = schema.safeParse({
    locale: formData.get("locale"),
    projectId: formData.get("projectId"),
    contractId: formData.get("contractId"),
  });
  if (!parsed.success) return { error: "invalid" };

  const supabase = await createClient();
  const { data: contract } = await supabase
    .from("project_contracts")
    .select("id, organization_id, project_id, status")
    .eq("id", parsed.data.contractId)
    .eq("project_id", parsed.data.projectId)
    .eq("organization_id", auth.membership.organization.id)
    .maybeSingle();
  if (!contract) return { error: "forbidden" };
  if (contract.status !== "draft") return { error: "invalid_state" };

  try {
    const result = await requestProjectContractSignature(parsed.data.contractId);
    revalidatePath(`/${parsed.data.locale}/projects/${parsed.data.projectId}`);
    return {
      message: result.needsForm ? "awaiting_form" : "sent",
    };
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "client_email_required") return { error: "client_email_required" };
    return { error: "send_failed" };
  }
}

export async function assignProjectContractTemplateAction(input: {
  locale: string;
  projectId: string;
  templateId: string;
}) {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };

  const supabase = await createClient();
  const { data: project } = await supabase
    .from("immigration_projects")
    .select("id, organization_id, form_language")
    .eq("id", input.projectId)
    .eq("organization_id", auth.membership.organization.id)
    .maybeSingle();
  if (!project) return { error: "forbidden" as const };

  const existing = await getActiveProjectContract(input.projectId);
  if (existing && existing.status !== "superseded") {
    return { error: "contract_exists" as const };
  }

  try {
    await createProjectContractFromTemplate({
      organizationId: auth.membership.organization.id,
      projectId: input.projectId,
      templateId: input.templateId,
      locale: toAppLocale(project.form_language ?? input.locale),
      orgDefaultLocale: auth.membership.organization.defaultLocale,
    });
  } catch {
    return { error: "create_failed" as const };
  }

  revalidatePath(`/${input.locale}/projects/${input.projectId}`);
  return { ok: true as const };
}

export async function listProjectContractsCatalog() {
  const membership = await getPrimaryMembership();
  if (!membership || !canCreateRecords(membership.role)) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_templates")
    .select("id, title, form_id, is_active")
    .eq("organization_id", membership.organization.id)
    .eq("is_active", true)
    .order("title", { ascending: true });
  return (data ?? []).map((row) => ({
    id: row.id as string,
    title: row.title as string,
    form_id: (row.form_id as string | null) ?? null,
  }));
}

export async function voidProjectContractEnvelopeAction(input: {
  locale: string;
  projectId: string;
  contractId: string;
}) {
  const auth = await requireStaff();
  if (!auth.ok) return { error: auth.error };
  await voidOpenContractsForProject(input.contractId);
  revalidatePath(`/${input.locale}/projects/${input.projectId}`);
  return { ok: true as const };
}
