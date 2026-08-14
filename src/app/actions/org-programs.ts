"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  mapOrganizationProgramRow,
  normalizeOrgProgramDocuments,
  normalizeOrgProgramForms,
  orgProgramFieldsSchema,
  type OrganizationProgram,
} from "@/lib/crm/org-programs";
import { recordAuditEvent } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";

export type OrgProgramActionState = {
  error?: string;
  message?: string;
  programId?: string;
};

const localeSchema = z.enum(["en", "fr", "es"]);

async function requireOrgMember() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  return { ok: true as const, membership };
}

function parseOrgProgramForm(formData: FormData) {
  const formsRaw = String(formData.get("forms") || "[]");
  const documentsRaw = String(formData.get("documents") || "[]");
  let forms: unknown = [];
  let documents: unknown = [];
  try {
    forms = JSON.parse(formsRaw);
    documents = JSON.parse(documentsRaw);
  } catch {
    return null;
  }

  return {
    locale: formData.get("locale") || "en",
    name: String(formData.get("name") || ""),
    allowsIndividual: formData.get("allowsIndividual") === "on",
    allowsCouple: formData.get("allowsCouple") === "on",
    allowsFamily: formData.get("allowsFamily") === "on",
    allowsInsideCanada: formData.get("allowsInsideCanada") === "on",
    allowsOutsideCanada: formData.get("allowsOutsideCanada") === "on",
    forms,
    documents,
  };
}

function revalidateProgramPaths(locale: string) {
  revalidatePath(`/${locale}/projects`);
  revalidatePath(`/${locale}/projects/new`);
  revalidatePath(`/${locale}/projects/templates`);
}

export async function listOrganizationPrograms(): Promise<OrganizationProgram[]> {
  const gate = await requireOrgMember();
  if (!gate.ok) return [];
  const orgId = gate.membership.organization.id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_programs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("listOrganizationPrograms:", error.message);
    return [];
  }
  return (data ?? []).map((row) =>
    mapOrganizationProgramRow(row as Record<string, unknown>),
  );
}

export async function getOrganizationProgram(
  programId: string,
): Promise<OrganizationProgram | null> {
  const gate = await requireOrgMember();
  if (!gate.ok) return null;
  const orgId = gate.membership.organization.id;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_programs")
    .select("*")
    .eq("organization_id", orgId)
    .eq("id", programId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("getOrganizationProgram:", error.message);
    return null;
  }
  return mapOrganizationProgramRow(data as Record<string, unknown>);
}

export async function createOrganizationProgramAction(
  _prev: OrgProgramActionState,
  formData: FormData,
): Promise<OrgProgramActionState> {
  const raw = parseOrgProgramForm(formData);
  if (!raw) return { error: "invalid" };
  const localeParsed = localeSchema.safeParse(raw.locale);
  const parsed = orgProgramFieldsSchema.safeParse(raw);
  if (!localeParsed.success || !parsed.success) return { error: "invalid" };

  const gate = await requireOrgMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const forms = normalizeOrgProgramForms(parsed.data.forms);
  const documents = normalizeOrgProgramDocuments(parsed.data.documents);

  const { data, error } = await supabase
    .from("organization_programs")
    .insert({
      organization_id: orgId,
      name: parsed.data.name,
      allows_individual: parsed.data.allowsIndividual,
      allows_couple: parsed.data.allowsCouple,
      allows_family: parsed.data.allowsFamily,
      allows_inside_canada: parsed.data.allowsInsideCanada,
      allows_outside_canada: parsed.data.allowsOutsideCanada,
      forms,
      documents,
      is_active: true,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createOrganizationProgram:", error?.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id ?? null,
    actorKind: "staff",
    action: "organization_program.create",
    resourceType: "organization_program",
    resourceId: data.id as string,
    metadata: { name: parsed.data.name },
  });

  revalidateProgramPaths(localeParsed.data);
  redirect(`/${localeParsed.data}/projects/templates`);
}

export async function updateOrganizationProgramAction(
  _prev: OrgProgramActionState,
  formData: FormData,
): Promise<OrgProgramActionState> {
  const programId = String(formData.get("programId") || "").trim();
  if (!z.string().uuid().safeParse(programId).success) {
    return { error: "invalid" };
  }

  const raw = parseOrgProgramForm(formData);
  if (!raw) return { error: "invalid" };
  const localeParsed = localeSchema.safeParse(raw.locale);
  const parsed = orgProgramFieldsSchema.safeParse(raw);
  if (!localeParsed.success || !parsed.success) return { error: "invalid" };

  const gate = await requireOrgMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const forms = normalizeOrgProgramForms(parsed.data.forms);
  const documents = normalizeOrgProgramDocuments(parsed.data.documents);

  const { data, error } = await supabase
    .from("organization_programs")
    .update({
      name: parsed.data.name,
      allows_individual: parsed.data.allowsIndividual,
      allows_couple: parsed.data.allowsCouple,
      allows_family: parsed.data.allowsFamily,
      allows_inside_canada: parsed.data.allowsInsideCanada,
      allows_outside_canada: parsed.data.allowsOutsideCanada,
      forms,
      documents,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .eq("id", programId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("updateOrganizationProgram:", error.message);
    return { error: "save_failed" };
  }
  if (!data) return { error: "not_found" };

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id ?? null,
    actorKind: "staff",
    action: "organization_program.update",
    resourceType: "organization_program",
    resourceId: programId,
    metadata: { name: parsed.data.name },
  });

  revalidateProgramPaths(localeParsed.data);
  redirect(`/${localeParsed.data}/projects/templates`);
}

export async function archiveOrganizationProgramAction(
  _prev: OrgProgramActionState,
  formData: FormData,
): Promise<OrgProgramActionState> {
  const programId = String(formData.get("programId") || "").trim();
  const localeParsed = localeSchema.safeParse(formData.get("locale") || "en");
  if (
    !z.string().uuid().safeParse(programId).success ||
    !localeParsed.success
  ) {
    return { error: "invalid" };
  }

  const gate = await requireOrgMember();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("organization_programs")
    .update({
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", orgId)
    .eq("id", programId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("archiveOrganizationProgram:", error.message);
    return { error: "save_failed" };
  }
  if (!data) return { error: "not_found" };

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id ?? null,
    actorKind: "staff",
    action: "organization_program.archive",
    resourceType: "organization_program",
    resourceId: programId,
  });

  revalidateProgramPaths(localeParsed.data);
  redirect(`/${localeParsed.data}/projects/templates`);
}
