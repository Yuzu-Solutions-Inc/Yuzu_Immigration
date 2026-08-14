"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
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
const fieldTypeSchema = z.enum([
  "text",
  "textarea",
  "email",
  "phone",
  "number",
  "date",
  "select",
  "checkbox",
]);

const createSchema = z.object({
  locale: localeSchema,
  serviceId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  fieldKey: z.string().trim().max(40).optional().or(z.literal("")),
  helpText: z.string().trim().max(300).optional().or(z.literal("")),
  fieldType: fieldTypeSchema,
  options: z.string().optional().or(z.literal("")),
  required: z.enum(["on", "true", "false"]).optional(),
});

const updateSchema = z.object({
  locale: localeSchema,
  fieldId: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  helpText: z.string().trim().max(300).optional().or(z.literal("")),
  options: z.string().optional().or(z.literal("")),
  required: z.enum(["on", "true", "false"]).optional(),
});

async function requireManager() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership };
}

function optionsForType(fieldType: string, raw: string | undefined) {
  if (fieldType !== "select") return [] as string[];
  const options = parseSelectOptions(raw ?? "");
  return options.length > 0 ? options : null;
}

export async function createServiceFormFieldAction(
  _prev: FormFieldActionState,
  formData: FormData,
): Promise<FormFieldActionState> {
  const parsed = createSchema.safeParse({
    locale: formData.get("locale") || "en",
    serviceId: String(formData.get("serviceId") || ""),
    label: String(formData.get("label") || ""),
    fieldKey: String(formData.get("fieldKey") || ""),
    helpText: String(formData.get("helpText") || ""),
    fieldType: String(formData.get("fieldType") || "text"),
    options: String(formData.get("options") || ""),
    required: formData.get("required") ? "on" : "false",
  });
  if (!parsed.success) return { error: "invalid" };

  const fieldKey = (
    parsed.data.fieldKey || slugFromFieldLabel(parsed.data.label)
  ).toLowerCase();
  if (!FORM_FIELD_KEY_RE.test(fieldKey) || isReservedBookingFieldKey(fieldKey)) {
    return { error: "invalid_key" };
  }
  const options = optionsForType(parsed.data.fieldType, parsed.data.options);
  if (options == null) return { error: "invalid_options" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data: service } = await supabase
    .from("booking_services")
    .select("id")
    .eq("id", parsed.data.serviceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!service) return { error: "invalid" };

  const { count } = await supabase
    .from("booking_service_form_fields")
    .select("id", { count: "exact", head: true })
    .eq("service_id", parsed.data.serviceId)
    .eq("organization_id", orgId);
  if ((count ?? 0) >= MAX_BOOKING_FORM_FIELDS) return { error: "too_many_fields" };

  const { data: last } = await supabase
    .from("booking_service_form_fields")
    .select("sort_order")
    .eq("service_id", parsed.data.serviceId)
    .eq("organization_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("booking_service_form_fields")
    .insert({
      organization_id: orgId,
      service_id: parsed.data.serviceId,
      field_key: fieldKey,
      label: parsed.data.label,
      help_text: parsed.data.helpText || null,
      field_type: parsed.data.fieldType,
      options,
      required: parsed.data.required === "on",
      sort_order: ((last?.sort_order as number | undefined) ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return { error: "duplicate_key" };
    console.error("createServiceFormField:", error?.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service_form_field.create",
    resourceType: "booking_service_form_field",
    resourceId: data.id,
    metadata: { serviceId: parsed.data.serviceId, fieldKey },
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  revalidatePath(`/${parsed.data.locale}/calendar`);
  return { message: "created" };
}

export async function updateServiceFormFieldAction(
  _prev: FormFieldActionState,
  formData: FormData,
): Promise<FormFieldActionState> {
  const parsed = updateSchema.safeParse({
    locale: formData.get("locale") || "en",
    fieldId: String(formData.get("fieldId") || ""),
    label: String(formData.get("label") || ""),
    helpText: String(formData.get("helpText") || ""),
    options: String(formData.get("options") || ""),
    required: formData.get("required") ? "on" : "false",
  });
  if (!parsed.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("booking_service_form_fields")
    .select("id, field_type")
    .eq("id", parsed.data.fieldId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!existing) return { error: "invalid" };

  const options = optionsForType(
    existing.field_type as string,
    parsed.data.options,
  );
  if (options == null) return { error: "invalid_options" };

  const { error } = await supabase
    .from("booking_service_form_fields")
    .update({
      label: parsed.data.label,
      help_text: parsed.data.helpText || null,
      options,
      required: parsed.data.required === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.fieldId)
    .eq("organization_id", orgId);

  if (error) {
    console.error("updateServiceFormField:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service_form_field.update",
    resourceType: "booking_service_form_field",
    resourceId: parsed.data.fieldId,
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  revalidatePath(`/${parsed.data.locale}/calendar`);
  return { message: "saved" };
}

export async function deleteServiceFormFieldAction(
  fieldId: string,
  locale: string,
): Promise<FormFieldActionState> {
  if (!z.string().uuid().safeParse(fieldId).success) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("booking_service_form_fields")
    .delete()
    .eq("id", fieldId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("deleteServiceFormField:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service_form_field.delete",
    resourceType: "booking_service_form_field",
    resourceId: fieldId,
  });

  revalidatePath(`/${parsedLocale.data}/services`);
  revalidatePath(`/${parsedLocale.data}/calendar`);
  return { message: "deleted" };
}
