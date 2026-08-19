import type {
  ContractEnvelopeStatus,
  ContractSignatureKind,
  ContractSignerRole,
  ContractSignerStatus,
} from "@/db/schema";

export const CONTRACT_ENVELOPES_BUCKET = "contract-envelopes";
export const CONTRACT_CONSENT_VERSION = "yuzu-esign-v1";
export const CONTRACT_EXPIRES_DAYS = 30;
export const MAX_CONTRACT_HTML_CHARS = 200_000;
export const MAX_CONTRACT_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_SIGNATURE_IMAGE_CHARS = 180_000;

export const SIGNATURE_ROLES = ["client", "consultant"] as const;

export const CONTRACT_BUILTIN_VARIABLES = [
  "customer_name",
  "customer_email",
  "customer_phone",
  "customer_address",
  "service_name",
  "consultant_name",
  "consultant_email",
  "organization_name",
  "date",
  "time",
  "datetime",
  "timezone",
  "duration",
  "meet_link",
  "signed_date",
] as const;

export type ContractBuiltinVariable =
  (typeof CONTRACT_BUILTIN_VARIABLES)[number];

export type ContractTemplateRow = {
  id: string;
  organization_id: string;
  title: string;
  body_html: string;
  require_consultant_signature: boolean;
  send_on_booking: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  service_ids: string[];
};

export type ContractEnvelopeRow = {
  id: string;
  organization_id: string;
  template_id: string;
  appointment_id: string;
  title: string;
  filled_html: string;
  filled_sha256: string;
  signed_pdf_storage_path: string | null;
  signed_pdf_sha256: string | null;
  status: ContractEnvelopeStatus;
  locale: string;
  expires_at: string;
  sent_at: string | null;
  completed_at: string | null;
  declined_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractSignerRow = {
  id: string;
  organization_id: string;
  envelope_id: string;
  role: ContractSignerRole;
  sort_order: number;
  full_name: string;
  email: string;
  token_hash: string | null;
  token_encrypted: string | null;
  status: ContractSignerStatus;
  signed_at: string | null;
  declined_at: string | null;
  viewed_at: string | null;
  signature_kind: ContractSignatureKind | null;
  signature_text: string | null;
  signature_image: string | null;
  ip: string | null;
  user_agent: string | null;
  consent_accepted_at: string | null;
  consent_version: string | null;
  created_at: string;
  updated_at: string;
};

export type ContractAuditEventRow = {
  id: string;
  organization_id: string;
  envelope_id: string;
  signer_id: string | null;
  event_type: string;
  ip: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type ContractEnvelopeSummary = {
  id: string;
  appointment_id: string;
  title: string;
  status: ContractEnvelopeStatus;
  expires_at: string;
  completed_at: string | null;
  needs_consultant_sign: boolean;
  client_status: ContractSignerStatus | null;
  consultant_status: ContractSignerStatus | null;
};
