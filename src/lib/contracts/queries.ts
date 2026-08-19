import { requireOrganizationId } from "@/lib/crm/queries";
import {
  decryptContractSignerRow,
  decryptStaffContractSignature,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import type {
  ContractEnvelopeSummary,
  ContractTemplateRow,
  StaffContractSignature,
} from "@/lib/contracts/types";

export async function listContractTemplates(): Promise<ContractTemplateRow[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];
  const supabase = await createClient();
  const [{ data, error }, linksRes] = await Promise.all([
    supabase
      .from("contract_templates")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
    supabase
      .from("contract_template_services")
      .select("template_id, service_id")
      .eq("organization_id", orgId),
  ]);
  if (error) {
    console.error("listContractTemplates:", error.message);
    return [];
  }
  const serviceIdsByTemplate = new Map<string, string[]>();
  for (const link of linksRes.data ?? []) {
    const list = serviceIdsByTemplate.get(link.template_id) ?? [];
    list.push(link.service_id);
    serviceIdsByTemplate.set(link.template_id, list);
  }
  return (data ?? []).map((row) => ({
    ...(row as Omit<ContractTemplateRow, "service_ids" | "translations">),
    translations:
      row.translations &&
      typeof row.translations === "object" &&
      !Array.isArray(row.translations)
        ? (row.translations as ContractTemplateRow["translations"])
        : {},
    service_ids: serviceIdsByTemplate.get(row.id as string) ?? [],
  }));
}

export async function listContractSummariesForAppointments(
  organizationId: string,
  appointmentIds: string[],
): Promise<ContractEnvelopeSummary[]> {
  if (appointmentIds.length === 0) return [];
  const supabase = await createClient();
  const { data: envelopes, error } = await supabase
    .from("contract_envelopes")
    .select("id, appointment_id, title, status, expires_at, completed_at")
    .eq("organization_id", organizationId)
    .in("appointment_id", appointmentIds);
  if (error) {
    console.error("listContractSummaries:", error.message);
    return [];
  }
  const envelopeIds = (envelopes ?? []).map((row) => row.id as string);
  const { data: signers } =
    envelopeIds.length === 0
      ? { data: [] as { envelope_id: string; role: string; status: string }[] }
      : await supabase
          .from("contract_signers")
          .select("envelope_id, role, status")
          .eq("organization_id", organizationId)
          .in("envelope_id", envelopeIds);
  const signerByEnvelope = new Map<
    string,
    { client?: string; consultant?: string }
  >();
  for (const row of signers ?? []) {
    const current = signerByEnvelope.get(row.envelope_id) ?? {};
    if (row.role === "client") current.client = row.status;
    if (row.role === "consultant") current.consultant = row.status;
    signerByEnvelope.set(row.envelope_id, current);
  }
  return (envelopes ?? []).map((row) => {
    const pair = signerByEnvelope.get(row.id) ?? {};
    return {
      id: row.id as string,
      appointment_id: row.appointment_id as string,
      title: row.title as string,
      status: row.status,
      expires_at: row.expires_at as string,
      completed_at: (row.completed_at as string | null) ?? null,
      needs_consultant_sign:
        pair.consultant === "pending" || pair.consultant === "viewed",
      client_status: (pair.client as ContractEnvelopeSummary["client_status"]) ?? null,
      consultant_status:
        (pair.consultant as ContractEnvelopeSummary["consultant_status"]) ??
        null,
    };
  });
}

export async function loadStaffEnvelopeDetail(envelopeId: string) {
  const supabase = await createClient();
  const { data: envelope } = await supabase
    .from("contract_envelopes")
    .select("*")
    .eq("id", envelopeId)
    .maybeSingle();
  if (!envelope) return null;
  const dek = await getOrgDataKey(envelope.organization_id as string);
  const [{ data: signers }, { data: audit }] = await Promise.all([
    supabase
      .from("contract_signers")
      .select(
        "id, role, sort_order, full_name, email, status, signed_at, viewed_at, signature_kind, consent_accepted_at, consent_version, ip",
      )
      .eq("envelope_id", envelopeId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("contract_audit_events")
      .select("id, event_type, created_at, ip, metadata")
      .eq("envelope_id", envelopeId)
      .order("created_at", { ascending: true }),
  ]);
  return {
    envelope,
    signers: (signers ?? []).map((row) => decryptContractSignerRow(row, dek)),
    audit: audit ?? [],
  };
}

export async function loadStaffContractSignature(): Promise<StaffContractSignature> {
  const empty: StaffContractSignature = {
    presignAll: false,
    kind: null,
    typedName: "",
    image: null,
  };
  const orgId = await requireOrganizationId();
  if (!orgId) return empty;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;
  const { data, error } = await supabase
    .from("staff_contract_signatures")
    .select("presign_all, signature_kind, signature_text, signature_image")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    console.error("loadStaffContractSignature:", error.message);
    return empty;
  }
  if (!data) return empty;
  const dek = await getOrgDataKey(orgId);
  const decrypted = decryptStaffContractSignature(data, dek);
  return {
    presignAll: Boolean(data.presign_all),
    kind: (data.signature_kind as StaffContractSignature["kind"]) ?? null,
    typedName: decrypted.signature_text ?? "",
    image: decrypted.signature_image ?? null,
  };
}
