import {
  decryptFieldMaybe,
  encryptField,
  isEncryptedField,
} from "@/lib/security/field-crypto";

/**
 * Org-DEK ciphertext columns. Money, enums, dates, hashes, IDs, and tax
 * jurisdiction codes stay plaintext so GL math and filters keep working.
 */
export const ORG_ENCRYPTED_COLUMNS: Record<string, readonly string[]> = {
  people: ["first_name", "last_name", "email", "phone"],
  person_notes: ["body"],
  project_notes: ["body"],
  immigration_projects: ["title", "description", "notes", "destruction_note"],
  inbound_messages: ["from_email", "subject", "body_text", "to_address"],
  inbound_attachments: ["filename"],
  project_document_files: ["original_filename"],
  project_document_requests: [
    "custom_label",
    "consultant_note",
    "rejection_comment",
  ],
  file_destruction_register: ["client_name", "service_summary"],
  booking_appointments: [
    "guest_name",
    "guest_email",
    "guest_phone",
    "guest_address",
  ],
  contract_envelopes: ["filled_html"],
  contract_signers: [
    "full_name",
    "email",
    "signature_text",
    "signature_image",
  ],
  project_contracts: ["body_html"],
  staff_contract_signatures: ["signature_text", "signature_image"],
  partners: [
    "legal_name",
    "contact_name",
    "email",
    "phone",
    "address_line1",
    "city",
    "postal_code",
    "notes",
  ],
  organization_settings: [
    "company_legal_name",
    "company_operating_name",
    "address_line1",
    "city",
    "postal_code",
    "neq",
    "gst_number",
    "qst_number",
    "email",
    "phone",
    "payment_instructions",
    "interac_email",
    "bank_institution",
    "bank_transit",
    "bank_account",
    "billing_inquiries_email",
    "payment_instructions_fr",
    "payment_instructions_en",
  ],
  organizations: [
    "privacy_contact_email",
    "owner_contact_name",
    "owner_contact_email",
  ],
  organization_invitations: ["email"],
  employees: ["first_name", "last_name", "email", "notes"],
  shareholders: ["legal_name", "email", "notes"],
  expenses: ["vendor", "description", "notes"],
  employee_expenses: ["vendor", "description", "notes"],
  bank_transactions: ["description", "notes"],
  invoices: ["notes"],
  invoice_line_items: ["description"],
  payments: ["notes", "reference"],
  payroll_runs: ["notes", "remittance_reference"],
  dividends: ["description", "notes"],
  projects: ["name", "notes", "po_number"],
  time_entries: ["description", "notes"],
  time_entry_lines: ["item_name", "notes"],
  document_attachments: ["filename"],
  compliance_deadlines: ["title", "notes"],
  accounting_adjustments: ["description", "notes"],
  corporate_tax_records: ["label", "notes"],
  sales_tax_periods: ["notes"],
  fiscal_period_closes: ["notes"],
  payment_requests: ["description"],
  project_booking_invites: ["emailed_to"],
  staff_notifications: ["title", "body"],
  google_calendar_connections: ["google_email"],
  microsoft_calendar_connections: ["microsoft_email"],
  zoom_connections: ["zoom_email"],
  square_connections: ["business_name"],
  stripe_connections: ["business_name"],
  sage_connections: ["business_name"],
};

/** Nested PostgREST embeds whose key matches a catalog table. */
const NESTED_RELATION_TABLE: Record<string, string> = {
  partners: "partners",
  employees: "employees",
  shareholders: "shareholders",
  invoices: "invoices",
  payroll_runs: "payroll_runs",
};

export function orgFieldAad(table: string, column: string) {
  return `${table}.${column}`;
}

export function isOrgEncryptedTable(table: string) {
  return table in ORG_ENCRYPTED_COLUMNS;
}

function asRow(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function encryptOrgRow<T>(table: string, row: T, key: Buffer): T {
  const cols = ORG_ENCRYPTED_COLUMNS[table];
  const source = asRow(row);
  if (!cols || !source) return row;
  const out: Record<string, unknown> = { ...source };
  for (const column of cols) {
    if (!(column in out)) continue;
    const value = out[column];
    if (typeof value !== "string" || value === "") continue;
    if (isEncryptedField(value)) continue;
    out[column] = encryptField(value, orgFieldAad(table, column), key);
  }
  return out as T;
}

export function encryptOrgValues<T>(table: string, values: T, key: Buffer): T {
  if (Array.isArray(values)) {
    return values.map((row) => encryptOrgRow(table, row, key)) as T;
  }
  return encryptOrgRow(table, values, key);
}

export function decryptOrgRow<T>(table: string, row: T, key: Buffer): T {
  const cols = ORG_ENCRYPTED_COLUMNS[table];
  const source = asRow(row);
  if (!source) return row;
  const out: Record<string, unknown> = { ...source };
  if (cols) {
    for (const column of cols) {
      if (!(column in out)) continue;
      const value = out[column];
      if (typeof value !== "string") continue;
      out[column] = decryptFieldMaybe(value, orgFieldAad(table, column), key);
    }
  }
  for (const [embed, nestedTable] of Object.entries(NESTED_RELATION_TABLE)) {
    if (!(embed in out)) continue;
    out[embed] = decryptOrgPayload(nestedTable, out[embed], key);
  }
  return out as T;
}

export function decryptOrgPayload<T>(table: string, payload: T, key: Buffer): T {
  if (payload == null) return payload;
  if (Array.isArray(payload)) {
    return payload.map((row) => decryptOrgRow(table, row, key)) as T;
  }
  return decryptOrgRow(table, payload, key);
}

/** In-memory name sort after ciphertext order would be meaningless. */
export function sortDecryptedRows<T>(table: string, rows: T): T {
  if (!Array.isArray(rows) || rows.length === 0) return rows;
  const keys =
    table === "partners" || table === "shareholders"
      ? (["legal_name"] as const)
      : table === "employees"
        ? (["last_name", "first_name"] as const)
        : null;
  if (!keys) return rows;
  const copy = [...rows] as Record<string, unknown>[];
  copy.sort((a, b) => {
    for (const key of keys) {
      const left = String(a[key] ?? "");
      const right = String(b[key] ?? "");
      const cmp = left.localeCompare(right, "en", { sensitivity: "base" });
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return copy as T;
}

export function fieldNeedsSeal(value: unknown) {
  return typeof value === "string" && value !== "" && !isEncryptedField(value);
}

export function rowNeedsSeal(table: string, row: Record<string, unknown>) {
  const cols = ORG_ENCRYPTED_COLUMNS[table];
  if (!cols) return false;
  return cols.some((column) => fieldNeedsSeal(row[column]));
}
