import { createServiceClient } from "@/lib/supabase/admin";
import { appendContractAudit } from "@/lib/contracts/issue";

const OPEN_STATUSES = ["sent", "viewed", "partially_signed"] as const;

export async function voidOpenContractsForProject(projectContractId: string) {
  const admin = createServiceClient();
  const now = new Date().toISOString();
  const { data } = await admin
    .from("contract_envelopes")
    .select("id, organization_id")
    .eq("project_contract_id", projectContractId)
    .in("status", [...OPEN_STATUSES]);
  if (!data?.length) return;

  await admin
    .from("contract_envelopes")
    .update({ status: "voided", voided_at: now, updated_at: now })
    .eq("project_contract_id", projectContractId)
    .in("status", [...OPEN_STATUSES]);

  await admin
    .from("project_contracts")
    .update({ status: "draft", updated_at: now })
    .eq("id", projectContractId)
    .eq("status", "pending_signature");

  for (const row of data) {
    await appendContractAudit({
      organizationId: row.organization_id as string,
      envelopeId: row.id as string,
      eventType: "voided",
      metadata: { reason: "project_contract_superseded" },
    });
  }
}

export async function listContractSummariesForProjects(
  organizationId: string,
  projectIds: string[],
) {
  if (projectIds.length === 0) return [];
  const admin = createServiceClient();
  const { data: envelopes, error } = await admin
    .from("contract_envelopes")
    .select("id, project_id, title, status, expires_at, completed_at")
    .eq("organization_id", organizationId)
    .in("project_id", projectIds);
  if (error) {
    console.error("listContractSummariesForProjects:", error.message);
    return [];
  }
  const envelopeIds = (envelopes ?? []).map((row) => row.id as string);
  const { data: signers } =
    envelopeIds.length === 0
      ? { data: [] as { envelope_id: string; role: string; status: string }[] }
      : await admin
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
      appointment_id: null,
      project_id: row.project_id as string,
      title: row.title as string,
      status: row.status,
      expires_at: row.expires_at as string,
      completed_at: (row.completed_at as string | null) ?? null,
      needs_consultant_sign:
        pair.consultant === "pending" || pair.consultant === "viewed",
      client_status: pair.client ?? null,
      consultant_status: pair.consultant ?? null,
    };
  });
}
