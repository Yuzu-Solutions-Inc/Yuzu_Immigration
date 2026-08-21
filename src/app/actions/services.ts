"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { parseDayOffsets } from "@/lib/booking/day-offsets";
import {
  parseServiceTranslations,
} from "@/lib/booking/service-i18n";
import {
  SERVICE_LINK_TTL_DAYS,
  URGENT_AUTO_DAYS_MAX,
  URGENT_AUTO_DAYS_MIN,
  hasUrgentPricing,
  type BookingRateKind,
} from "@/lib/booking/pricing";
import { parsePriceToCents } from "@/lib/booking/slots";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
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
  urgentPrice: z.string().optional(),
  autoUrgent: z.enum(["on", "true", "false"]).optional(),
  urgentAutoWithinDays: z.string().optional(),
  isActive: z.enum(["on", "true", "false"]).optional(),
  allowPayLater: z.enum(["on", "true", "false"]).optional(),
  paymentReminderDays: z.string().optional(),
});

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
    urgentPrice: String(formData.get("urgentPrice") || ""),
    autoUrgent: formData.get("autoUrgent") ? "on" : "false",
    urgentAutoWithinDays: String(formData.get("urgentAutoWithinDays") || ""),
    isActive: formData.get("isActive") ? "on" : "false",
    allowPayLater: formData.get("allowPayLater") ? "on" : "false",
    paymentReminderDays: String(formData.get("paymentReminderDays") || ""),
  };
}

function parseUrgentPricing(input: {
  urgentPrice?: string;
  autoUrgent?: string;
  urgentAutoWithinDays?: string;
}): { urgentPriceCents: number | null; urgentAutoWithinDays: number | null } | null {
  const raw = (input.urgentPrice ?? "").trim();
  let urgentPriceCents: number | null = null;
  if (raw) {
    const cents = parsePriceToCents(raw);
    if (cents == null) return null;
    urgentPriceCents = cents;
  }
  const autoOn = input.autoUrgent === "on";
  if (!autoOn) {
    return { urgentPriceCents, urgentAutoWithinDays: null };
  }
  if (urgentPriceCents == null) return null;
  const days = Number.parseInt(String(input.urgentAutoWithinDays || "").trim(), 10);
  if (
    !Number.isFinite(days) ||
    days < URGENT_AUTO_DAYS_MIN ||
    days > URGENT_AUTO_DAYS_MAX
  ) {
    return null;
  }
  return { urgentPriceCents, urgentAutoWithinDays: days };
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
  const urgent = parseUrgentPricing(parsed.data);
  if (!urgent) return { error: "invalid" };
  const reminderDays = parseDayOffsets(parsed.data.paymentReminderDays);
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
      urgent_price_cents: urgent.urgentPriceCents,
      urgent_auto_within_days: urgent.urgentAutoWithinDays,
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
  const urgent = parseUrgentPricing(parsed.data);
  if (!urgent) return { error: "invalid" };
  const reminderDays = parseDayOffsets(parsed.data.paymentReminderDays);
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
      urgent_price_cents: urgent.urgentPriceCents,
      urgent_auto_within_days: urgent.urgentAutoWithinDays,
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

export type CopyServiceLinkState = {
  error?: string;
  bookingUrl?: string;
};

export async function copyServiceLinkAction(input: {
  locale: string;
  serviceId: string;
  rateKind: BookingRateKind;
}): Promise<CopyServiceLinkState> {
  const parsedLocale = localeSchema.safeParse(input.locale);
  if (!parsedLocale.success) return { error: "invalid" };
  if (!z.string().uuid().safeParse(input.serviceId).success) {
    return { error: "invalid" };
  }
  if (input.rateKind !== "standard" && input.rateKind !== "urgent") {
    return { error: "invalid" };
  }

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!settings) return { error: "booking_not_configured" };

  const { data: service } = await supabase
    .from("booking_services")
    .select("id, price_cents, urgent_price_cents, urgent_auto_within_days")
    .eq("id", input.serviceId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!service) return { error: "not_found" };
  if (input.rateKind === "urgent" && !hasUrgentPricing(service)) {
    return { error: "invalid" };
  }

  await supabase
    .from("booking_service_links")
    .delete()
    .eq("organization_id", orgId)
    .lt("expires_at", new Date().toISOString());

  const token = createBookingToken();
  const expiresAt = new Date(
    Date.now() + SERVICE_LINK_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const { error } = await supabase.from("booking_service_links").insert({
    organization_id: orgId,
    service_id: input.serviceId,
    created_by: user?.id ?? null,
    rate_kind: input.rateKind,
    token_hash: hashBookingToken(token),
    expires_at: expiresAt,
  });

  if (error) {
    console.error("copyServiceLink:", error.message);
    return { error: "link_failed" };
  }

  const base = await getAppBaseUrl();
  const bookingUrl = `${base.replace(/\/$/, "")}/${parsedLocale.data}/book/${token}`;

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service_link.create",
    resourceType: "booking_service",
    resourceId: input.serviceId,
    metadata: { rateKind: input.rateKind },
  });

  return { bookingUrl };
}
