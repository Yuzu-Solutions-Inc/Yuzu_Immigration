import {
  decryptFieldMaybe,
  decryptJson,
  encryptField,
  encryptJson,
  encryptOptionalField,
  isEncryptedField,
  isEncryptedJson,
  type EncryptedJsonEnvelope,
} from "@/lib/security/field-crypto";

export const PII_AAD = {
  people: {
    firstName: "people.first_name",
    lastName: "people.last_name",
    email: "people.email",
    phone: "people.phone",
  },
  notes: { body: "person_notes.body" },
  projects: {
    title: "immigration_projects.title",
    description: "immigration_projects.description",
    notes: "immigration_projects.notes",
    destructionNote: "immigration_projects.destruction_note",
  },
  answers: "project_form_answers.answers",
  documents: {
    originalFilename: "project_document_files.original_filename",
    customLabel: "project_document_requests.custom_label",
    consultantNote: "project_document_requests.consultant_note",
  },
  destruction: {
    clientName: "file_destruction_register.client_name",
    serviceSummary: "file_destruction_register.service_summary",
  },
} as const;

type PersonPii = {
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ProjectPii = {
  title?: string | null;
  description?: string | null;
  notes?: string | null;
  destruction_note?: string | null;
};

type DocumentRequestPii = {
  custom_label?: string | null;
  consultant_note?: string | null;
};

type DocumentFilePii = {
  original_filename?: string | null;
};

type DestructionPii = {
  client_name?: string | null;
  service_summary?: string | null;
};

export function encryptPersonWrite(
  input: {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
  },
  key: Buffer,
) {
  return {
    first_name: encryptField(input.first_name, PII_AAD.people.firstName, key),
    last_name: encryptField(input.last_name, PII_AAD.people.lastName, key),
    email: encryptOptionalField(input.email, PII_AAD.people.email, key),
    phone: encryptOptionalField(input.phone, PII_AAD.people.phone, key),
  };
}

export function decryptPersonRow<T extends PersonPii>(row: T, key: Buffer): T {
  return {
    ...row,
    first_name: decryptFieldMaybe(
      row.first_name,
      PII_AAD.people.firstName,
      key,
    ) as T["first_name"],
    last_name: decryptFieldMaybe(
      row.last_name,
      PII_AAD.people.lastName,
      key,
    ) as T["last_name"],
    email: decryptFieldMaybe(row.email, PII_AAD.people.email, key) as T["email"],
    phone: decryptFieldMaybe(row.phone, PII_AAD.people.phone, key) as T["phone"],
  };
}

export function encryptProjectWrite(
  input: {
    title: string;
    description?: string | null;
    notes?: string | null;
    destruction_note?: string | null;
  },
  key: Buffer,
) {
  return {
    title: encryptField(input.title, PII_AAD.projects.title, key),
    description: encryptOptionalField(
      input.description,
      PII_AAD.projects.description,
      key,
    ),
    notes: encryptOptionalField(input.notes, PII_AAD.projects.notes, key),
    ...(input.destruction_note !== undefined
      ? {
          destruction_note: encryptOptionalField(
            input.destruction_note,
            PII_AAD.projects.destructionNote,
            key,
          ),
        }
      : {}),
  };
}

export function decryptProjectRow<T extends ProjectPii>(
  row: T,
  key: Buffer,
): T {
  return {
    ...row,
    title: decryptFieldMaybe(row.title, PII_AAD.projects.title, key) as T["title"],
    description: decryptFieldMaybe(
      row.description,
      PII_AAD.projects.description,
      key,
    ) as T["description"],
    notes: decryptFieldMaybe(row.notes, PII_AAD.projects.notes, key) as T["notes"],
    destruction_note: decryptFieldMaybe(
      row.destruction_note,
      PII_AAD.projects.destructionNote,
      key,
    ) as T["destruction_note"],
  };
}

export function encryptNoteBody(body: string, key: Buffer): string {
  return encryptField(body, PII_AAD.notes.body, key);
}

export function decryptNoteBody(
  body: string | null | undefined,
  key: Buffer,
): string {
  return decryptFieldMaybe(body, PII_AAD.notes.body, key) ?? "";
}

export function encryptAnswersValue(
  answers: unknown,
  key: Buffer,
): EncryptedJsonEnvelope {
  return encryptJson(answers ?? {}, PII_AAD.answers, key);
}

export function decryptAnswersValue(
  answers: unknown,
  key: Buffer,
): Record<string, unknown> {
  const decoded = decryptJson(answers, PII_AAD.answers, key);
  if (decoded && typeof decoded === "object" && !Array.isArray(decoded)) {
    return decoded as Record<string, unknown>;
  }
  return {};
}

export function answersNeedSeal(answers: unknown): boolean {
  if (answers == null) return false;
  if (isEncryptedJson(answers)) return false;
  return true;
}

export function encryptFilename(name: string, key: Buffer): string {
  return encryptField(name, PII_AAD.documents.originalFilename, key);
}

export function decryptFilename(
  name: string | null | undefined,
  key: Buffer,
): string {
  return decryptFieldMaybe(name, PII_AAD.documents.originalFilename, key) ?? "";
}

export function encryptDocumentRequestWrite(
  input: {
    custom_label?: string | null;
    consultant_note?: string | null;
  },
  key: Buffer,
) {
  return {
    ...(input.custom_label !== undefined
      ? {
          custom_label: encryptOptionalField(
            input.custom_label,
            PII_AAD.documents.customLabel,
            key,
          ),
        }
      : {}),
    ...(input.consultant_note !== undefined
      ? {
          consultant_note: encryptOptionalField(
            input.consultant_note,
            PII_AAD.documents.consultantNote,
            key,
          ),
        }
      : {}),
  };
}

export function decryptDocumentRequestRow<T extends DocumentRequestPii>(
  row: T,
  key: Buffer,
): T {
  return {
    ...row,
    custom_label: decryptFieldMaybe(
      row.custom_label,
      PII_AAD.documents.customLabel,
      key,
    ) as T["custom_label"],
    consultant_note: decryptFieldMaybe(
      row.consultant_note,
      PII_AAD.documents.consultantNote,
      key,
    ) as T["consultant_note"],
  };
}

export function decryptDocumentFileRow<T extends DocumentFilePii>(
  row: T,
  key: Buffer,
): T {
  return {
    ...row,
    original_filename: decryptFieldMaybe(
      row.original_filename,
      PII_AAD.documents.originalFilename,
      key,
    ) as T["original_filename"],
  };
}

export function encryptDestructionWrite(
  input: {
    client_name: string;
    service_summary?: string | null;
  },
  key: Buffer,
) {
  return {
    client_name: encryptField(
      input.client_name,
      PII_AAD.destruction.clientName,
      key,
    ),
    service_summary: encryptOptionalField(
      input.service_summary,
      PII_AAD.destruction.serviceSummary,
      key,
    ),
  };
}

export function decryptDestructionRow<T extends DestructionPii>(
  row: T,
  key: Buffer,
): T {
  return {
    ...row,
    client_name: decryptFieldMaybe(
      row.client_name,
      PII_AAD.destruction.clientName,
      key,
    ) as T["client_name"],
    service_summary: decryptFieldMaybe(
      row.service_summary,
      PII_AAD.destruction.serviceSummary,
      key,
    ) as T["service_summary"],
  };
}

export function fieldNeedsSeal(value: string | null | undefined): boolean {
  if (value == null || value === "") return false;
  return !isEncryptedField(value);
}
