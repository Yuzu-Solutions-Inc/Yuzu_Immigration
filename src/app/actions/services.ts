"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import {
  parseServiceTranslations,
} from "@/lib/booking/service-i18n";
import { parsePriceToCents } from "@/lib/booking/slots";
import { toAppLocale } from "@/lib/i18n/locales";
import { recordAuditEvent } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";

export type ServiceActionState = {
  error?: string;
  message?: string;
};

const localeSchema = z.enum(["en", "fr", "es"]);

const serviceFieldsSchema = z.object({
  locale: localeSchema,
  translations: z.string(),
  durationMinutes: z.coerce.number().int().min(5).max(480),
  price: z.string(),
  isActive: z.enum(["on", "true", "false"]).optional(),
  allowPayLater: z.enum(["on", "true", "false"]).optional(),
  paymentReminderDays: z.string().optional(),
});

function parseReminderDays(raw: string | undefined): number[] | null {
  if (!raw || !raw.trim()) return [];
  const parts = raw
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 3) return null;
  const days: number[] = [];
  const seen = new Set<number>();
  for (const part of parts) {
    const value = Number.parseInt(part, 10);
    if (!Number.isFinite(value) || value < 0 || value > 90) return null;
    if (seen.has(value)) continue;
    seen.add(value);
    days.push(value);
  }
  return days.sort((a, b) => b - a);
}

async function requireManager() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) {
    return { ok: false as const, error: "forbidden" as const };
  }
  return { ok: true as const, membership };
}

function parseServiceForm(formData: FormData) {
  return {
    locale: formData.get("locale") || "en",
    translations: String(formData.get("translations") || "{}"),
    durationMinutes: formData.get("durationMinutes"),
    price: String(formData.get("price") || "0"),
    isActive: formData.get("isActive") ? "on" : "false",
    allowPayLater: formData.get("allowPayLater") ? "on" : "false",
    paymentReminderDays: String(formData.get("paymentReminderDays") || ""),
  };
}

function parseTranslationsJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export async function createServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = serviceFieldsSchema.safeParse(parseServiceForm(formData));
  if (!parsed.success) return { error: "invalid" };
  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents == null) return { error: "invalid" };
  const reminderDays = parseReminderDays(parsed.data.paymentReminderDays);
  if (reminderDays == null) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const orgDefault = toAppLocale(gate.membership.organization.defaultLocale);
  const translations = parseServiceTranslations(
    parseTranslationsJson(parsed.data.translations),
  );
  const canonical = translations[orgDefault];
  if (!canonical?.title) return { error: "invalid" };
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("booking_services")
    .insert({
      organization_id: orgId,
      title: canonical.title,
      description: canonical.description || null,
      translations,
      duration_minutes: parsed.data.durationMinutes,
      price_cents: priceCents,
      is_active: parsed.data.isActive === "on",
      allow_pay_later: priceCents > 0 && parsed.data.allowPayLater === "on",
      payment_reminder_days: reminderDays,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("createService:", error?.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service.create",
    resourceType: "booking_service",
    resourceId: data.id,
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  revalidatePath(`/${parsed.data.locale}/calendar`);
  return { message: "created" };
}

export async function updateServiceAction(
  _prev: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const parsed = serviceFieldsSchema
    .extend({ serviceId: z.string().uuid() })
    .safeParse({
      ...parseServiceForm(formData),
      serviceId: String(formData.get("serviceId") || ""),
    });
  if (!parsed.success) return { error: "invalid" };
  const priceCents = parsePriceToCents(parsed.data.price);
  if (priceCents == null) return { error: "invalid" };
  const reminderDays = parseReminderDays(parsed.data.paymentReminderDays);
  if (reminderDays == null) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const orgDefault = toAppLocale(gate.membership.organization.defaultLocale);
  const translations = parseServiceTranslations(
    parseTranslationsJson(parsed.data.translations),
  );
  const canonical = translations[orgDefault];
  if (!canonical?.title) return { error: "invalid" };
  const user = await getSessionUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("booking_services")
    .update({
      title: canonical.title,
      description: canonical.description || null,
      translations,
      duration_minutes: parsed.data.durationMinutes,
      price_cents: priceCents,
      is_active: parsed.data.isActive === "on",
      allow_pay_later: priceCents > 0 && parsed.data.allowPayLater === "on",
      payment_reminder_days: reminderDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.serviceId)
    .eq("organization_id", orgId);

  if (error) {
    console.error("updateService:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service.update",
    resourceType: "booking_service",
    resourceId: parsed.data.serviceId,
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  revalidatePath(`/${parsed.data.locale}/calendar`);
  return { message: "saved" };
}

export async function deleteServiceAction(
  serviceId: string,
  locale: string,
): Promise<ServiceActionState> {
  if (!z.string().uuid().safeParse(serviceId).success) return { error: "invalid" };
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { count } = await supabase
    .from("booking_appointments")
    .select("id", { count: "exact", head: true })
    .eq("service_id", serviceId)
    .eq("organization_id", orgId);

  if ((count ?? 0) > 0) {
    const { error } = await supabase
      .from("booking_services")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", serviceId)
      .eq("organization_id", orgId);
    if (error) {
      console.error("archiveService:", error.message);
      return { error: "save_failed" };
    }
    revalidatePath(`/${parsedLocale.data}/services`);
    return { message: "archived" };
  }

  const { error } = await supabase
    .from("booking_services")
    .delete()
    .eq("id", serviceId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("deleteService:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service.delete",
    resourceType: "booking_service",
    resourceId: serviceId,
  });

  revalidatePath(`/${parsedLocale.data}/services`);
  revalidatePath(`/${parsedLocale.data}/calendar`);
  return { message: "deleted" };
}
