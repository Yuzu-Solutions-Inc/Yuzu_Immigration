import { z } from "zod";

import type { FormCode } from "@/lib/ircc/catalog";
import { ALL_FORM_CODES, isFormCode } from "@/lib/ircc/catalog";
import type { ProjectComposition } from "@/lib/crm/programs";
import type { ApplicationLocation } from "@/lib/ircc/kits";

export const ORG_PROGRAM_VALUE_PREFIX = "org:" as const;

export type OrgProgramFormSeed = {
  formCode: FormCode;
  isRequired: boolean;
  sortOrder: number;
};

export type OrgProgramDocumentSeed = {
  docKey: "passport" | "photo" | "custom";
  customLabel: string | null;
  scope: "person" | "project";
  isRequired: boolean;
  sortOrder: number;
};

export type OrganizationProgram = {
  id: string;
  organization_id: string;
  name: string;
  allows_individual: boolean;
  allows_couple: boolean;
  allows_family: boolean;
  allows_inside_canada: boolean;
  allows_outside_canada: boolean;
  forms: OrgProgramFormSeed[];
  documents: OrgProgramDocumentSeed[];
  is_active: boolean;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const orgProgramFormSchema = z.object({
  formCode: z.string().refine(isFormCode, "invalid_form"),
  isRequired: z.boolean().default(true),
  sortOrder: z.number().int().min(0).max(10_000).default(0),
});

export const orgProgramDocumentSchema = z
  .object({
    docKey: z.enum(["passport", "photo", "custom"]),
    customLabel: z.string().trim().max(120).nullable().optional(),
    scope: z.enum(["person", "project"]).default("person"),
    isRequired: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(10_000).default(0),
  })
  .superRefine((doc, ctx) => {
    const label = doc.customLabel?.trim() ?? "";
    if (doc.docKey === "custom" && label.length < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "custom_label_required",
        path: ["customLabel"],
      });
    }
    if (doc.docKey !== "custom" && label.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "custom_label_forbidden",
        path: ["customLabel"],
      });
    }
  });

export const orgProgramFieldsSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    allowsIndividual: z.boolean(),
    allowsCouple: z.boolean(),
    allowsFamily: z.boolean(),
    allowsInsideCanada: z.boolean(),
    allowsOutsideCanada: z.boolean(),
    forms: z.array(orgProgramFormSchema).max(40),
    documents: z.array(orgProgramDocumentSchema).max(40),
  })
  .superRefine((data, ctx) => {
    if (!data.allowsIndividual && !data.allowsCouple && !data.allowsFamily) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "composition_required",
        path: ["allowsIndividual"],
      });
    }
    if (!data.allowsInsideCanada && !data.allowsOutsideCanada) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "location_required",
        path: ["allowsInsideCanada"],
      });
    }
  });

export function orgProgramSelectValue(id: string): string {
  return `${ORG_PROGRAM_VALUE_PREFIX}${id}`;
}

export function parseOrgProgramSelectValue(
  value: string,
): { kind: "builtin"; family: string } | { kind: "org"; id: string } {
  if (value.startsWith(ORG_PROGRAM_VALUE_PREFIX)) {
    return { kind: "org", id: value.slice(ORG_PROGRAM_VALUE_PREFIX.length) };
  }
  return { kind: "builtin", family: value };
}

export function compositionAllowed(
  program: Pick<
    OrganizationProgram,
    "allows_individual" | "allows_couple" | "allows_family"
  >,
  composition: ProjectComposition,
): boolean {
  switch (composition) {
    case "couple":
      return program.allows_couple;
    case "family":
      return program.allows_family;
    default:
      return program.allows_individual;
  }
}

export function resolveOrgProgramApplicationLocation(
  program: Pick<
    OrganizationProgram,
    "allows_inside_canada" | "allows_outside_canada"
  >,
  preferred?: ApplicationLocation | null,
): ApplicationLocation | null {
  const inside = program.allows_inside_canada;
  const outside = program.allows_outside_canada;
  if (preferred === "inside" && inside) return "inside";
  if (preferred === "outside" && outside) return "outside";
  if (outside && !inside) return "outside";
  if (inside && !outside) return "inside";
  if (inside && outside) return preferred === "inside" ? "inside" : "outside";
  return null;
}

export function normalizeOrgProgramForms(
  forms: unknown,
): OrgProgramFormSeed[] {
  if (!Array.isArray(forms)) return [];
  const out: OrgProgramFormSeed[] = [];
  forms.forEach((raw, index) => {
    const parsed = orgProgramFormSchema.safeParse(raw);
    if (!parsed.success) return;
    out.push({
      formCode: parsed.data.formCode as FormCode,
      isRequired: parsed.data.isRequired,
      sortOrder: parsed.data.sortOrder || (index + 1) * 10,
    });
  });
  return out;
}

export function normalizeOrgProgramDocuments(
  documents: unknown,
): OrgProgramDocumentSeed[] {
  if (!Array.isArray(documents)) return [];
  const out: OrgProgramDocumentSeed[] = [];
  documents.forEach((raw, index) => {
    const parsed = orgProgramDocumentSchema.safeParse(raw);
    if (!parsed.success) return;
    out.push({
      docKey: parsed.data.docKey,
      customLabel:
        parsed.data.docKey === "custom"
          ? (parsed.data.customLabel?.trim() ?? null)
          : null,
      scope: parsed.data.scope,
      isRequired: parsed.data.isRequired,
      sortOrder: parsed.data.sortOrder || (index + 1) * 10,
    });
  });
  return out;
}

export function mapOrganizationProgramRow(
  row: Record<string, unknown>,
): OrganizationProgram {
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    name: String(row.name),
    allows_individual: Boolean(row.allows_individual),
    allows_couple: Boolean(row.allows_couple),
    allows_family: Boolean(row.allows_family),
    allows_inside_canada: Boolean(row.allows_inside_canada),
    allows_outside_canada: Boolean(row.allows_outside_canada),
    forms: normalizeOrgProgramForms(row.forms),
    documents: normalizeOrgProgramDocuments(row.documents),
    is_active: row.is_active !== false,
    sort_order: Number(row.sort_order ?? 0),
    created_by: (row.created_by as string | null) ?? null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

/** Default checklist when creating a new org program in the UI. */
export function defaultOrgProgramDraft(): {
  forms: OrgProgramFormSeed[];
  documents: OrgProgramDocumentSeed[];
} {
  return {
    forms: [
      {
        formCode: "imm5476",
        isRequired: true,
        sortOrder: 90,
      },
    ],
    documents: [
      {
        docKey: "passport",
        customLabel: null,
        scope: "person",
        isRequired: true,
        sortOrder: 10,
      },
      {
        docKey: "photo",
        customLabel: null,
        scope: "person",
        isRequired: true,
        sortOrder: 20,
      },
    ],
  };
}

export const PROPOSED_ORG_PROGRAM_FORM_CODES: FormCode[] = [...ALL_FORM_CODES];

export const PROPOSED_ORG_PROGRAM_DOC_KEYS = ["passport", "photo"] as const;
