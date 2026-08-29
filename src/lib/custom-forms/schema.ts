import { z } from "zod";

import type { AppLocale } from "@/lib/i18n/locales";
import { toAppLocale } from "@/lib/i18n/locales";
import {
  matchesShowWhen,
  type ShowWhen,
  type ShowWhenRule,
} from "@/lib/forms/visibility";

export type { ShowWhen, ShowWhenRule };

export const CUSTOM_FORM_FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "tel",
  "number",
  "date",
  "month",
  "select",
  "yesno",
  "checkbox",
  "address",
  "phone_contact",
  "passport",
  "repeatable",
] as const;

export type CustomFieldType = (typeof CUSTOM_FORM_FIELD_TYPES)[number];

export const CUSTOM_FORM_SCOPES = ["person", "project"] as const;
export type CustomFormScope = (typeof CUSTOM_FORM_SCOPES)[number];

export const COMPOSITE_CUSTOM_FIELD_TYPES = [
  "address",
  "phone_contact",
  "passport",
] as const;

export type LocalizedText = {
  en: string;
  fr?: string;
  es?: string;
};

export type CustomFieldOption = {
  value: string;
  label: LocalizedText;
};

export type CustomField = {
  id: string;
  key: string;
  type: CustomFieldType;
  label: LocalizedText;
  help?: LocalizedText;
  required?: boolean;
  options?: CustomFieldOption[];
  showWhen?: ShowWhenRule;
  columns?: CustomField[];
  maxRows?: number;
  minRows?: number;
};

export type CustomSection = {
  id: string;
  key: string;
  title: LocalizedText;
  description?: LocalizedText;
  showWhen?: ShowWhenRule;
  fields: CustomField[];
};

export type CustomFormSchema = {
  version: 1;
  sections: CustomSection[];
};

export const FIELD_KEY_RE = /^[a-z][a-zA-Z0-9_.]{0,63}$/;
export const MAX_CUSTOM_FORM_SECTIONS = 40;
export const MAX_FIELDS_PER_SECTION = 40;
export const MAX_REPEATABLE_COLUMNS = 12;
export const MAX_REPEATABLE_ROWS = 30;

const localizedTextSchema: z.ZodType<LocalizedText> = z.object({
  en: z.string().trim().min(1).max(200),
  fr: z.string().trim().max(200).optional(),
  es: z.string().trim().max(200).optional(),
});

const showWhenSchema: z.ZodType<ShowWhen> = z.object({
  key: z.string().min(1).max(80),
  equals: z.string().max(80).optional(),
  notEquals: z.string().max(80).optional(),
  oneOf: z.array(z.string().max(80)).max(20).optional(),
});

const showWhenRuleSchema: z.ZodType<ShowWhenRule> = z.lazy(() =>
  z.union([
    showWhenSchema,
    z.array(showWhenSchema).min(1).max(8),
    z.object({ or: z.array(showWhenSchema).min(1).max(8) }),
  ]),
);

const customFieldSchema: z.ZodType<CustomField> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(80),
    key: z.string().regex(FIELD_KEY_RE),
    type: z.enum(CUSTOM_FORM_FIELD_TYPES),
    label: localizedTextSchema,
    help: localizedTextSchema.optional(),
    required: z.boolean().optional(),
    options: z
      .array(
        z.object({
          value: z.string().trim().min(1).max(80),
          label: localizedTextSchema,
        }),
      )
      .max(80)
      .optional(),
    showWhen: showWhenRuleSchema.optional(),
    columns: z.array(customFieldSchema).max(MAX_REPEATABLE_COLUMNS).optional(),
    maxRows: z.number().int().min(1).max(MAX_REPEATABLE_ROWS).optional(),
    minRows: z.number().int().min(0).max(MAX_REPEATABLE_ROWS).optional(),
  }),
);

export const customSectionSchema: z.ZodType<CustomSection> = z.object({
  id: z.string().min(1).max(80),
  key: z.string().regex(FIELD_KEY_RE),
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  showWhen: showWhenRuleSchema.optional(),
  fields: z.array(customFieldSchema).max(MAX_FIELDS_PER_SECTION),
});

export const customFormSchemaSchema: z.ZodType<CustomFormSchema> = z
  .object({
    version: z.literal(1),
    sections: z.array(customSectionSchema).max(MAX_CUSTOM_FORM_SECTIONS),
  })
  .superRefine((schema, ctx) => {
    const keys = collectFieldKeys(schema);
    const seen = new Set<string>();
    for (const key of keys) {
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "duplicate_key",
          path: ["sections"],
        });
        return;
      }
      seen.add(key);
    }
  });

export const emptyCustomFormSchema = (): CustomFormSchema => ({
  version: 1,
  sections: [],
});

export function parseCustomFormSchema(raw: unknown): CustomFormSchema {
  const parsed = customFormSchemaSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return emptyCustomFormSchema();
}

export function localizedLabel(
  text: LocalizedText | undefined,
  locale: string,
): string {
  if (!text) return "";
  const app = toAppLocale(locale);
  if (app === "fr" && text.fr?.trim()) return text.fr.trim();
  if (app === "es" && text.es?.trim()) return text.es.trim();
  return text.en.trim();
}

export function collectFields(schema: CustomFormSchema): CustomField[] {
  return schema.sections.flatMap((section) => section.fields);
}

export function collectFieldKeys(schema: CustomFormSchema): string[] {
  const keys: string[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      keys.push(field.key);
      if (field.type === "repeatable" && field.columns) {
        for (const col of field.columns) keys.push(`${field.key}.${col.key}`);
      }
    }
  }
  return keys;
}

export function isCompositeCustomFieldType(
  type: CustomFieldType,
): type is (typeof COMPOSITE_CUSTOM_FIELD_TYPES)[number] {
  return (COMPOSITE_CUSTOM_FIELD_TYPES as readonly string[]).includes(type);
}

export function isSelectLikeType(type: CustomFieldType): boolean {
  return type === "select" || type === "yesno";
}

export function gateFieldCandidates(
  schema: CustomFormSchema,
  beforeFieldId?: string,
): CustomField[] {
  const out: CustomField[] = [];
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (beforeFieldId && field.id === beforeFieldId) return out;
      if (isSelectLikeType(field.type)) out.push(field);
    }
  }
  return out;
}

export function isCustomFieldVisible(
  field: Pick<CustomField, "showWhen">,
  answers: Record<string, unknown>,
): boolean {
  return matchesShowWhen(field.showWhen, answers);
}

export function isCustomSectionVisible(
  section: Pick<CustomSection, "showWhen">,
  answers: Record<string, unknown>,
): boolean {
  return matchesShowWhen(section.showWhen, answers);
}

export function newBuilderId(): string {
  return crypto.randomUUID();
}

export function slugFromLabel(label: string): string {
  const slug = label
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 40);
  return slug && FIELD_KEY_RE.test(slug) ? slug : `field_${Date.now().toString(36)}`;
}

export type OrgProgramCustomFormSeed = {
  templateId: string;
  scope: CustomFormScope;
  isRequired: boolean;
  sortOrder: number;
};

export const orgProgramCustomFormSchema = z.object({
  templateId: z.string().uuid(),
  scope: z.enum(CUSTOM_FORM_SCOPES).default("person"),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export function normalizeOrgProgramCustomForms(
  raw: unknown,
): OrgProgramCustomFormSeed[] {
  if (!Array.isArray(raw)) return [];
  const out: OrgProgramCustomFormSeed[] = [];
  raw.forEach((item, index) => {
    const parsed = orgProgramCustomFormSchema.safeParse(rawItem(item));
    if (!parsed.success) return;
    out.push({
      templateId: parsed.data.templateId,
      scope: parsed.data.scope,
      isRequired: parsed.data.isRequired,
      sortOrder: parsed.data.sortOrder || (index + 1) * 10,
    });
  });
  return out;
}

function rawItem(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const row = item as Record<string, unknown>;
  if (row.templateId || row.template_id) {
    return {
      templateId: row.templateId ?? row.template_id,
      scope: row.scope,
      isRequired: row.isRequired ?? row.is_required,
      sortOrder: row.sortOrder ?? row.sort_order,
    };
  }
  return item;
}

export function cloneSchemaWithNewIds(schema: CustomFormSchema): CustomFormSchema {
  return {
    version: 1,
    sections: schema.sections.map((section) => ({
      ...section,
      id: newBuilderId(),
      fields: section.fields.map((field) => ({
        ...field,
        id: newBuilderId(),
        columns: field.columns?.map((col) => ({ ...col, id: newBuilderId() })),
      })),
    })),
  };
}

export function uniqueKeyInSchema(
  schema: CustomFormSchema,
  desired: string,
): string {
  const used = new Set(collectFieldKeys(schema));
  if (!used.has(desired) && FIELD_KEY_RE.test(desired)) return desired;
  let i = 2;
  while (i < 100) {
    const next = `${desired.replace(/_\d+$/, "")}_${i}`.slice(0, 64);
    if (FIELD_KEY_RE.test(next) && !used.has(next)) return next;
    i += 1;
  }
  return `field_${newBuilderId().slice(0, 8)}`;
}

export type CustomFormTemplateRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  schema: CustomFormSchema;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type ProjectCustomFormRow = {
  id: string;
  organization_id: string;
  project_id: string;
  template_id: string | null;
  title: string;
  schema: CustomFormSchema;
  scope: CustomFormScope;
  person_id: string | null;
  is_required: boolean;
  sort_order: number;
  status: "todo" | "in_progress" | "ready" | "generated";
  created_at: string;
  updated_at: string;
};

export function mapCustomFormTemplateRow(
  row: Record<string, unknown>,
): CustomFormTemplateRow {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    title: String(row.title ?? ""),
    description: (row.description as string | null) ?? null,
    schema: parseCustomFormSchema(row.schema),
    is_active: row.is_active !== false,
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function mapProjectCustomFormRow(
  row: Record<string, unknown>,
): ProjectCustomFormRow {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    project_id: String(row.project_id),
    template_id: (row.template_id as string | null) ?? null,
    title: String(row.title ?? ""),
    schema: parseCustomFormSchema(row.schema),
    scope: row.scope === "project" ? "project" : "person",
    person_id: (row.person_id as string | null) ?? null,
    is_required: row.is_required !== false,
    sort_order: Number(row.sort_order ?? 0),
    status: (row.status as ProjectCustomFormRow["status"]) ?? "todo",
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function fieldOptionsForControl(
  field: CustomField,
  locale: string,
): Array<{ value: string; label: string }> {
  if (field.type === "yesno") {
    const app = toAppLocale(locale);
    return [
      {
        value: "Y",
        label: app === "fr" ? "Oui" : app === "es" ? "Sí" : "Yes",
      },
      {
        value: "N",
        label: app === "fr" ? "Non" : app === "es" ? "No" : "No",
      },
    ];
  }
  return (field.options ?? []).map((opt) => ({
    value: opt.value,
    label: localizedLabel(opt.label, locale),
  }));
}

export function isAnswerFilled(value: unknown, type: CustomFieldType): boolean {
  if (type === "checkbox") {
    return value === "Y" || value === "N" || value === true || value === false;
  }
  if (type === "repeatable") {
    return Array.isArray(value) && value.length > 0;
  }
  if (isCompositeCustomFieldType(type)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return Object.values(value as Record<string, unknown>).some(
      (part) => String(part ?? "").trim().length > 0,
    );
  }
  return String(value ?? "").trim().length > 0;
}

export type AppLocaleForForms = AppLocale;
