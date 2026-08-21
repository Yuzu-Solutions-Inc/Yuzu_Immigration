"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageBookingCatalog } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  BOOKING_FORM_FIELD_TYPES,
  FORM_FIELD_KEY_RE,
  MAX_BOOKING_FORM_FIELDS,
  isReservedBookingFieldKey,
  parseSelectOptions,
  slugFromFieldLabel,
} from "@/lib/booking/form-fields";
import { recordAuditEvent } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";

export type FormFieldActionState = {
  error?: string;
  message?: string;
};

const localeSchema = z.enum(["en", "fr", "es"]);
const fieldTypeSchema = z.enum(BOOKING_FORM_FIELD_TYPES);

const draftFieldSchema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  label: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().max(40).optional().or(z.literal("")),
  helpText: z.string().trim().max(300).optional().or(z.literal("")),
  fieldType: fieldTypeSchema,
  options: z.array(z.string().trim().min(1).max(80)).max(20),
  required: z.boolean(),
});

const saveSchema = z.object({
  locale: localeSchema,
  formId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(1).max(80),
  serviceIds: z.array(z.string().uuid()).min(1).max(50),
  fields: z.array(draftFieldSchema).max(MAX_BOOKING_FORM_FIELDS),
});

async function requireCatalogAdmin() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canManageBookingCatalog(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership };
}

function parseServiceIds(raw: string) {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

function parseFields(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function saveBookingFormAction(
  _prev: FormFieldActionState,
  formData: FormData,
): Promise<FormFieldActionState> {
  const parsed = saveSchema.safeParse({
    locale: formData.get("locale") || "en",
    formId: String(formData.get("formId") || ""),
    title: String(formData.get("title") || ""),
    serviceIds: parseServiceIds(String(formData.get("serviceIds") || "[]")),
    fields: parseFields(String(formData.get("fields") || "[]")),
  });
  if (!parsed.success) return { error: "invalid" };

  const normalizedFields: {
    label: string;
    fieldKey: string;
    helpText: string | null;
    fieldType: (typeof BOOKING_FORM_FIELD_TYPES)[number];
    options: string[];
    required: boolean;
  }[] = [];
  const seenKeys = new Set<string>();
  for (const field of parsed.data.fields) {
    const fieldKey = (
      field.fieldKey || slugFromFieldLabel(field.label)
    ).toLowerCase();
    if (!FORM_FIELD_KEY_RE.test(fieldKey) || isReservedBookingFieldKey(fieldKey)) {
      return { error: "invalid_key" };
    }
    if (seenKeys.has(fieldKey)) return { error: "duplicate_key" };
    seenKeys.add(fieldKey);
    const options =
      field.fieldType === "select" ? parseSelectOptions(field.options.join("\n")) : [];
    if (field.fieldType === "select" && options.length === 0) {
      return { error: "invalid_options" };
    }
    normalizedFields.push({
      label: field.label,
      fieldKey,
      helpText: field.helpText || null,
      fieldType: field.fieldType,
      options,
      required: field.required,
    });
  }

  const gate = await requireCatalogAdmin();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data: orgServices, error: servicesError } = await supabase
    .from("booking_services")
    .select("id")
    .eq("organization_id", orgId)
    .in("id", parsed.data.serviceIds);
  if (servicesError || (orgServices ?? []).length !== parsed.data.serviceIds.length) {
    return { error: "invalid" };
  }

  let formId = parsed.data.formId || "";
  const isCreate = !formId;
  if (isCreate) {
    const { data: created, error } = await supabase
      .from("booking_forms")
      .insert({
        organization_id: orgId,
        title: parsed.data.title,
      })
      .select("id")
      .single();
    if (error || !created) {
      console.error("createBookingForm:", error?.message);
      return { error: "save_failed" };
    }
    formId = created.id;
  } else {
    const { data: existing } = await supabase
      .from("booking_forms")
      .select("id")
      .eq("id", formId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!existing) return { error: "invalid" };
    const { error } = await supabase
      .from("booking_forms")
      .update({
        title: parsed.data.title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", formId)
      .eq("organization_id", orgId);
    if (error) {
      console.error("updateBookingForm:", error.message);
      return { error: "save_failed" };
    }
  }

  const { error: clearError } = await supabase
    .from("booking_services")
    .update({ form_id: null, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .eq("form_id", formId);
  if (clearError) {
    console.error("clearFormServices:", clearError.message);
    return { error: "save_failed" };
  }
  const { error: assignError } = await supabase
    .from("booking_services")
    .update({ form_id: formId, updated_at: new Date().toISOString() })
    .eq("organization_id", orgId)
    .in("id", parsed.data.serviceIds);
  if (assignError) {
    console.error("assignFormServices:", assignError.message);
    return { error: "save_failed" };
  }

  const { data: existingFields, error: existingError } = await supabase
    .from("booking_service_form_fields")
    .select("id, field_key, field_type")
    .eq("form_id", formId)
    .eq("organization_id", orgId);
  if (existingError) {
    console.error("listFormFields:", existingError.message);
    return { error: "save_failed" };
  }
  const existingByKey = new Map(
    (existingFields ?? []).map((row) => [
      row.field_key as string,
      { id: row.id as string, fieldType: row.field_type as string },
    ]),
  );
  const keepIds: string[] = [];
  for (const [index, field] of normalizedFields.entries()) {
    const existing = existingByKey.get(field.fieldKey);
    if (existing) {
      const { error } = await supabase
        .from("booking_service_form_fields")
        .update({
          label: field.label,
          help_text: field.helpText,
          options: field.options,
          required: field.required,
          sort_order: index,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("organization_id", orgId);
      if (error) {
        console.error("updateFormField:", error.message);
        return { error: "save_failed" };
      }
      keepIds.push(existing.id);
    } else {
      const { data: inserted, error } = await supabase
        .from("booking_service_form_fields")
        .insert({
          organization_id: orgId,
          form_id: formId,
          field_key: field.fieldKey,
          label: field.label,
          help_text: field.helpText,
          field_type: field.fieldType,
          options: field.options,
          required: field.required,
          sort_order: index,
        })
        .select("id")
        .single();
      if (error || !inserted) {
        if (error?.code === "23505") return { error: "duplicate_key" };
        console.error("insertFormField:", error?.message);
        return { error: "save_failed" };
      }
      keepIds.push(inserted.id);
    }
  }
  const removeIds = (existingFields ?? [])
    .map((row) => row.id as string)
    .filter((id) => !keepIds.includes(id));
  if (removeIds.length > 0) {
    const { error } = await supabase
      .from("booking_service_form_fields")
      .delete()
      .eq("organization_id", orgId)
      .eq("form_id", formId)
      .in("id", removeIds);
    if (error) {
      console.error("deleteFormFields:", error.message);
      return { error: "save_failed" };
    }
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: isCreate ? "booking.form.create" : "booking.form.update",
    resourceType: "booking_form",
    resourceId: formId,
    metadata: { serviceIds: parsed.data.serviceIds },
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  revalidatePath(`/${parsed.data.locale}/calendar`);
  return { message: isCreate ? "created" : "saved" };
}

export async function deleteBookingFormAction(
  formId: string,
  locale: string,
): Promise<FormFieldActionState> {
  if (!z.string().uuid().safeParse(formId).success) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const gate = await requireCatalogAdmin();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("booking_forms")
    .delete()
    .eq("id", formId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("deleteBookingForm:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.form.delete",
    resourceType: "booking_form",
    resourceId: formId,
  });

  revalidatePath(`/${parsedLocale.data}/services`);
  revalidatePath(`/${parsedLocale.data}/calendar`);
  return { message: "deleted" };
}
