import { getAppBaseUrl } from "@/lib/app-url";
import { product } from "@/lib/brand/product";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import { extraAutomationVariables } from "@/lib/booking/form-fields";
import {
  CONTRACT_EXPIRES_DAYS,
} from "@/lib/contracts/types";
import { fillContractHtml } from "@/lib/contracts/html";
import {
  appendContractAudit,
  sha256Hex,
} from "@/lib/contracts/issue";
import { pickContractBody } from "@/lib/contracts/translations";
import { projectContractMergeVariables } from "@/lib/contracts/variables";
import { CLIENT_DOCUMENTS_BUCKET } from "@/lib/documents/catalog";
import { encryptDocument } from "@/lib/documents/crypto";
import { toAppLocale } from "@/lib/i18n/locales";
import {
  decryptBookingFormAnswers,
  decryptContractSignerToken,
  decryptPersonRow,
  decryptProjectContractBody,
  decryptProjectRow,
  encryptContractFilledHtml,
  encryptContractSignerWrite,
  encryptContractSignatureWrite,
  encryptProjectContractBody,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ProjectContractStatus } from "@/db/schema";
import type { ContractTranslations } from "@/lib/contracts/translations";

export type ProjectContractRow = {
  id: string;
  organization_id: string;
  project_id: string;
  template_id: string | null;
  form_id: string | null;
  title: string;
  body_html: string;
  translations: ContractTranslations;
  form_answers: Record<string, string>;
  form_submitted_at: string | null;
  require_consultant_signature: boolean;
  status: ProjectContractStatus;
  version: number;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectContractFileRow = {
  id: string;
  organization_id: string;
  project_id: string;
  project_contract_id: string;
  envelope_id: string;
  principal_person_id: string | null;
  title: string;
  version: number;
  storage_path: string;
  file_sha256: string;
  completed_at: string;
  created_at: string;
};

export type ProjectContractGate = {
  locked: boolean;
  needsForm: boolean;
  contract?: ProjectContractRow;
  pendingEnvelopeId?: string;
  signToken?: string;
};

const OPEN_ENVELOPE_STATUSES = ["sent", "viewed", "partially_signed"] as const;

function signUrl(origin: string, locale: string, token: string) {
  return `${origin.replace(/\/$/, "")}/${locale}/sign/${encodeURIComponent(token)}`;
}

export async function getActiveProjectContract(
  projectId: string,
): Promise<ProjectContractRow | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("project_contracts")
    .select("*")
    .eq("project_id", projectId)
    .neq("status", "superseded")
    .order("version", { ascending: false });
  if (error) {
    console.error("getActiveProjectContract:", error.message);
    return null;
  }
  const row =
    (data ?? []).find((item) =>
      ["draft", "pending_signature"].includes(item.status as string),
    ) ?? (data ?? [])[0];
  if (!row) return null;

  let formId = (row.form_id as string | null) ?? null;
  const templateId = (row.template_id as string | null) ?? null;
  // Keep the project copy tied to the template's linked form.
  if (templateId) {
    const { data: template } = await admin
      .from("contract_templates")
      .select("form_id")
      .eq("id", templateId)
      .maybeSingle();
    const templateFormId = (template?.form_id as string | null) ?? null;
    if (templateFormId && templateFormId !== formId) {
      formId = templateFormId;
      await admin
        .from("project_contracts")
        .update({ form_id: formId, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    }
  }

  const dek = await getOrgDataKey(row.organization_id as string);
  const decrypted = decryptProjectContractBody(row, dek);
  return {
    ...(row as Omit<
      ProjectContractRow,
      "body_html" | "form_answers" | "form_id" | "form_submitted_at"
    >),
    form_id: formId,
    form_submitted_at: (row.form_submitted_at as string | null) ?? null,
    body_html: decrypted.body_html,
    form_answers: decryptBookingFormAnswers(row.form_answers, dek),
    translations:
      row.translations &&
      typeof row.translations === "object" &&
      !Array.isArray(row.translations)
        ? (row.translations as ContractTranslations)
        : {},
  };
}

export async function listProjectContractFiles(
  projectId: string,
): Promise<ProjectContractFileRow[]> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("project_contract_files")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listProjectContractFiles:", error.message);
    return [];
  }
  return (data ?? []) as ProjectContractFileRow[];
}

export async function getProjectContractGate(
  projectId: string,
  personId: string,
): Promise<ProjectContractGate> {
  const contract = await getActiveProjectContract(projectId);
  if (!contract || contract.status !== "pending_signature") {
    return { locked: false, needsForm: false, contract: contract ?? undefined };
  }

  const admin = createServiceClient();
  const { data: participant } = await admin
    .from("project_participants")
    .select("id, role")
    .eq("project_id", projectId)
    .eq("person_id", personId)
    .is("left_at", null)
    .maybeSingle();
  if (!participant) {
    return { locked: false, needsForm: false, contract };
  }

  const isPrincipal = participant.role === "principal";
  const needsForm = Boolean(contract.form_id) && !contract.form_submitted_at;

  if (needsForm) {
    return {
      locked: true,
      needsForm: true,
      contract,
    };
  }

  const { data: envelope } = await admin
    .from("contract_envelopes")
    .select("id, locale")
    .eq("project_contract_id", contract.id)
    .in("status", [...OPEN_ENVELOPE_STATUSES, "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!envelope) {
    // Form done (or no form) but envelope not issued yet — still locked for principal.
    return {
      locked: true,
      needsForm: false,
      contract,
    };
  }

  const { data: clientSigner } = await admin
    .from("contract_signers")
    .select("id, token_encrypted, status")
    .eq("envelope_id", envelope.id)
    .eq("role", "client")
    .maybeSingle();

  // Unlock the project as soon as the client has signed (consultant may still be pending).
  if (!clientSigner || clientSigner.status === "signed") {
    return {
      locked: false,
      needsForm: false,
      contract,
      pendingEnvelopeId: envelope.id as string,
    };
  }

  const dek = await getOrgDataKey(contract.organization_id);
  let signToken: string | undefined;
  if (clientSigner.token_encrypted) {
    signToken =
      decryptContractSignerToken(
        clientSigner.token_encrypted as string,
        dek,
      ) ?? undefined;
  }

  return {
    locked: true,
    needsForm: false,
    contract,
    pendingEnvelopeId: envelope.id as string,
    signToken: isPrincipal ? signToken : undefined,
  };
}

export async function createProjectContractFromTemplate(input: {
  organizationId: string;
  projectId: string;
  templateId: string;
  locale: string;
  orgDefaultLocale: string;
  customBodyHtml?: string;
  customTranslations?: ContractTranslations;
}) {
  const admin = createServiceClient();
  const { data: template, error } = await admin
    .from("contract_templates")
    .select("*")
    .eq("id", input.templateId)
    .eq("organization_id", input.organizationId)
    .maybeSingle();
  if (error || !template) {
    throw new Error("template_missing");
  }

  const picked = pickContractBody({
    translations: input.customTranslations ?? template.translations,
    fallbackHtml:
      input.customBodyHtml ?? String(template.body_html ?? ""),
    preferredLocale: toAppLocale(input.locale),
    orgDefaultLocale: input.orgDefaultLocale,
  });

  const dek = await getOrgDataKey(input.organizationId);
  const encrypted = encryptProjectContractBody(
    {
      body_html: picked.html,
      form_answers: {},
    },
    dek,
  );

  const { data: row, error: insertError } = await admin
    .from("project_contracts")
    .insert({
      organization_id: input.organizationId,
      project_id: input.projectId,
      template_id: input.templateId,
      form_id: (template.form_id as string | null) ?? null,
      title: template.title,
      ...encrypted,
      translations: input.customTranslations ?? template.translations ?? {},
      require_consultant_signature: template.require_consultant_signature,
      status: "draft",
      version: 1,
    })
    .select("id")
    .maybeSingle();
  if (insertError || !row) {
    console.error("createProjectContractFromTemplate:", insertError?.message);
    throw new Error("create_failed");
  }
  return row.id as string;
}

export async function supersedeAndCreateProjectContractVersion(
  contractId: string,
  input: {
    bodyHtml: string;
    translations: ContractTranslations;
    title: string;
  },
) {
  const admin = createServiceClient();
  const { data: existing, error } = await admin
    .from("project_contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  if (error || !existing) throw new Error("contract_missing");

  const orgId = existing.organization_id as string;
  const dek = await getOrgDataKey(orgId);
  const now = new Date().toISOString();

  if (existing.status === "draft") {
    const encrypted = encryptProjectContractBody(
      { body_html: input.bodyHtml, form_answers: existing.form_answers },
      dek,
    );
    const { error: updateError } = await admin
      .from("project_contracts")
      .update({
        title: input.title,
        ...encrypted,
        translations: input.translations,
        form_id: existing.form_id,
        template_id: existing.template_id,
        updated_at: now,
      })
      .eq("id", contractId);
    if (updateError) throw new Error("save_failed");
    return contractId;
  }

  await admin
    .from("contract_envelopes")
    .update({ status: "voided", voided_at: now, updated_at: now })
    .eq("project_contract_id", contractId)
    .in("status", [...OPEN_ENVELOPE_STATUSES]);

  const encrypted = encryptProjectContractBody(
    { body_html: input.bodyHtml, form_answers: {} },
    dek,
  );
  const { data: created, error: createError } = await admin
    .from("project_contracts")
    .insert({
      organization_id: orgId,
      project_id: existing.project_id,
      template_id: existing.template_id,
      form_id: existing.form_id,
      title: input.title,
      ...encrypted,
      translations: input.translations,
      require_consultant_signature: existing.require_consultant_signature,
      status: "draft",
      form_submitted_at: null,
      version: (existing.version as number) + 1,
    })
    .select("id")
    .maybeSingle();
  if (createError || !created) throw new Error("create_failed");

  await admin
    .from("project_contracts")
    .update({
      status: "superseded",
      superseded_by: created.id,
      updated_at: now,
    })
    .eq("id", contractId);

  return created.id as string;
}

export async function requestProjectContractSignature(contractId: string) {
  const admin = createServiceClient();
  const { data: contract, error } = await admin
    .from("project_contracts")
    .select("id, status, form_id, form_submitted_at")
    .eq("id", contractId)
    .maybeSingle();
  if (error || !contract) throw new Error("contract_missing");
  if (contract.status !== "draft") throw new Error("invalid_state");

  const needsForm =
    Boolean(contract.form_id) && !contract.form_submitted_at;

  if (needsForm) {
    const now = new Date().toISOString();
    const { error: updateError } = await admin
      .from("project_contracts")
      .update({
        status: "pending_signature",
        updated_at: now,
      })
      .eq("id", contractId);
    if (updateError) throw new Error("send_failed");
    return { issued: false as const, needsForm: true as const };
  }

  await issueProjectContract(contractId);
  return { issued: true as const, needsForm: false as const };
}

export async function saveProjectContractFormAnswers(input: {
  contractId: string;
  answers: Record<string, string>;
}) {
  const admin = createServiceClient();
  const { data: contract, error } = await admin
    .from("project_contracts")
    .select("*")
    .eq("id", input.contractId)
    .maybeSingle();
  if (error || !contract) throw new Error("contract_missing");
  if (contract.status !== "pending_signature") throw new Error("invalid_state");
  if (!contract.form_id) throw new Error("no_form");
  if (contract.form_submitted_at) throw new Error("already_submitted");

  const dek = await getOrgDataKey(contract.organization_id as string);
  const encrypted = encryptProjectContractBody(
    {
      body_html: decryptProjectContractBody(contract, dek).body_html,
      form_answers: input.answers,
    },
    dek,
  );
  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("project_contracts")
    .update({
      ...encrypted,
      form_submitted_at: now,
      updated_at: now,
    })
    .eq("id", input.contractId);
  if (updateError) throw new Error("save_failed");

  await issueProjectContract(input.contractId);
  return { ok: true as const };
}

export async function issueProjectContract(contractId: string) {
  const admin = createServiceClient();
  const { data: contract, error } = await admin
    .from("project_contracts")
    .select("*")
    .eq("id", contractId)
    .maybeSingle();
  if (error || !contract) throw new Error("contract_missing");
  if (
    contract.status !== "draft" &&
    contract.status !== "pending_signature"
  ) {
    throw new Error("invalid_state");
  }

  const { data: existingEnvelope } = await admin
    .from("contract_envelopes")
    .select("id")
    .eq("project_contract_id", contractId)
    .in("status", [...OPEN_ENVELOPE_STATUSES, "completed"])
    .maybeSingle();
  if (existingEnvelope) return { envelopeId: existingEnvelope.id as string };

  if (contract.form_id && !contract.form_submitted_at) {
    throw new Error("form_required");
  }

  const orgId = contract.organization_id as string;
  const projectId = contract.project_id as string;
  const dek = await getOrgDataKey(orgId);
  const decrypted = decryptProjectContractBody(contract, dek);
  const formAnswers = decryptBookingFormAnswers(contract.form_answers, dek);

  const [
    { data: project },
    { data: org },
    { data: settings },
    { data: principalLink },
  ] = await Promise.all([
    admin
      .from("immigration_projects")
      .select(
        "id, title, program_family, form_language, representative_user_id, organization_program_id",
      )
      .eq("id", projectId)
      .maybeSingle(),
    admin.from("organizations").select("name, default_locale").eq("id", orgId).maybeSingle(),
    admin
      .from("booking_settings")
      .select("timezone")
      .eq("organization_id", orgId)
      .maybeSingle(),
    admin
      .from("project_participants")
      .select("person_id, role")
      .eq("project_id", projectId)
      .eq("role", "principal")
      .is("left_at", null)
      .maybeSingle(),
  ]);
  if (!project || !principalLink?.person_id) throw new Error("project_missing");

  const decryptedProject = decryptProjectRow(
    { title: project.title as string },
    dek,
  );

  const { data: personRow } = await admin
    .from("people")
    .select("first_name, last_name, email, phone")
    .eq("id", principalLink.person_id)
    .maybeSingle();
  if (!personRow?.email) throw new Error("client_email_required");

  const person = decryptPersonRow(
    personRow as {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    },
    dek,
  );
  const clientName = `${person.first_name} ${person.last_name}`.trim();
  const clientEmail = person.email?.trim();
  if (!clientEmail?.includes("@")) throw new Error("client_email_required");

  const repUserId =
    (project.representative_user_id as string | null) ??
    null;
  const { data: repProfile } = repUserId
    ? await admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", repUserId)
        .maybeSingle()
    : { data: null };

  const consultantName =
    repProfile?.full_name?.trim() || repProfile?.email || "Consultant";
  const consultantEmail = repProfile?.email ?? "";
  const locale = toAppLocale(
    project.form_language || org?.default_locale || "en",
  );
  const orgDefaultLocale = org?.default_locale ?? "en";
  const picked = pickContractBody({
    translations: contract.translations,
    fallbackHtml: decrypted.body_html,
    preferredLocale: locale,
    orgDefaultLocale,
  });

  let programLabel = String(project.program_family ?? "");
  if (project.organization_program_id) {
    const { data: orgProgram } = await admin
      .from("organization_programs")
      .select("name")
      .eq("id", project.organization_program_id)
      .maybeSingle();
    if (orgProgram?.name) programLabel = String(orgProgram.name);
  }

  const addressParts: string[] = [];
  const vars = projectContractMergeVariables({
    locale: picked.locale,
    timeZone: settings?.timezone ?? "America/Toronto",
    customerName: clientName,
    customerEmail: clientEmail,
    customerPhone: person.phone ?? "",
    customerAddress: addressParts.join(", "),
    projectTitle: decryptedProject.title ?? "",
    programName: programLabel,
    consultantName,
    consultantEmail,
    organizationName: org?.name ?? product.name,
    formAnswers: {
      ...formAnswers,
      ...extraAutomationVariables(formAnswers),
    },
  });
  const filledHtml = fillContractHtml(picked.html, vars);
  const filledSha256 = sha256Hex(filledHtml);
  const expiresAt = new Date(
    Date.now() + CONTRACT_EXPIRES_DAYS * 86_400_000,
  ).toISOString();
  const templateId = contract.template_id as string;
  if (!templateId) throw new Error("template_missing");

  const { data: envelope, error: envelopeError } = await admin
    .from("contract_envelopes")
    .insert({
      organization_id: orgId,
      template_id: templateId,
      project_id: projectId,
      project_contract_id: contractId,
      title: contract.title,
      filled_html: encryptContractFilledHtml(filledHtml, dek),
      filled_sha256: filledSha256,
      status: "sent",
      locale: picked.locale,
      expires_at: expiresAt,
      sent_at: new Date().toISOString(),
    })
    .select("id")
    .maybeSingle();
  if (envelopeError || !envelope) {
    console.error("issue project contract envelope:", envelopeError?.message);
    throw new Error("issue_failed");
  }

  const clientToken = createBookingToken();
  const clientPii = encryptContractSignerWrite(
    { full_name: clientName, email: clientEmail },
    dek,
  );
  const clientTokenEnc = encryptContractSignatureWrite({ token: clientToken }, dek);
  const signers: Record<string, unknown>[] = [
    {
      organization_id: orgId,
      envelope_id: envelope.id,
      role: "client",
      sort_order: 0,
      ...clientPii,
      token_hash: hashBookingToken(clientToken),
      token_encrypted: clientTokenEnc.token_encrypted,
      status: "pending",
    },
  ];

  if (contract.require_consultant_signature) {
    const consultantPii = encryptContractSignerWrite(
      { full_name: consultantName, email: consultantEmail || "none@invalid" },
      dek,
    );
    // Project retainers: client signs first; case manager validates and countersigns later.
    signers.push({
      organization_id: orgId,
      envelope_id: envelope.id,
      role: "consultant",
      sort_order: 1,
      ...consultantPii,
      status: "pending",
      signed_at: null,
      signature_kind: null,
      signature_text: null,
      signature_image: null,
      consent_accepted_at: null,
      consent_version: null,
    });
  }

  const { error: signerError } = await admin.from("contract_signers").insert(signers);
  if (signerError) {
    await admin.from("contract_envelopes").delete().eq("id", envelope.id);
    throw new Error("issue_failed");
  }

  await admin
    .from("project_contracts")
    .update({
      status: "pending_signature",
      updated_at: new Date().toISOString(),
    })
    .eq("id", contractId);

  await appendContractAudit({
    organizationId: orgId,
    envelopeId: envelope.id as string,
    eventType: "sent",
    metadata: { projectContractId: contractId, projectId },
  });

  const origin = await getAppBaseUrl();
  const { sendContractSignatureRequestEmail } = await import(
    "@/lib/email/contract-signature"
  );
  await sendContractSignatureRequestEmail({
    locale: picked.locale,
    organizationName: org?.name ?? product.name,
    organizationId: orgId,
    to: clientEmail,
    signerName: clientName,
    contractTitle: contract.title as string,
    signUrl: signUrl(origin, picked.locale, clientToken),
    role: "client",
    envelopeId: envelope.id as string,
    projectId,
    replyToUserId: repUserId,
  });

  return { envelopeId: envelope.id as string };
}

export async function archiveProjectContractPdf(input: {
  organizationId: string;
  projectId: string;
  projectContractId: string;
  envelopeId: string;
  principalPersonId: string | null;
  title: string;
  version: number;
  pdfBytes: Uint8Array;
  pdfSha256: string;
  completedAt: string;
}) {
  const admin = createServiceClient();
  const dek = await getOrgDataKey(input.organizationId);
  const fileId = crypto.randomUUID();
  const path = `${input.organizationId}/${input.projectId}/contracts/${fileId}.enc`;
  const encrypted = encryptDocument(Buffer.from(input.pdfBytes), dek);
  const { error: uploadError } = await admin.storage
    .from(CLIENT_DOCUMENTS_BUCKET)
    .upload(path, encrypted, {
      contentType: "application/octet-stream",
      upsert: false,
    });
  if (uploadError) {
    console.error("archive project contract pdf:", uploadError.message);
    return;
  }
  const { error } = await admin.from("project_contract_files").insert({
    id: fileId,
    organization_id: input.organizationId,
    project_id: input.projectId,
    project_contract_id: input.projectContractId,
    envelope_id: input.envelopeId,
    principal_person_id: input.principalPersonId,
    title: input.title,
    version: input.version,
    storage_path: path,
    file_sha256: input.pdfSha256,
    completed_at: input.completedAt,
  });
  if (error) console.error("project_contract_files insert:", error.message);
}
