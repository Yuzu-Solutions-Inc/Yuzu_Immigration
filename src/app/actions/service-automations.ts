"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { parseDayOffsets } from "@/lib/booking/day-offsets";
import type { AutomationTranslations } from "@/lib/booking/types";
import {
  hasAutomationCopy,
  parseAutomationRecipients,
  parseAutomationTranslations,
} from "@/lib/email/automation-template";
import { APP_LOCALES, toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import { recordAuditEvent } from "@/lib/security/audit";
import { createClient } from "@/lib/supabase/server";

export type AutomationActionState = {
  error?: string;
  message?: string;
};

const localeSchema = z.enum(["en", "fr", "es"]);

const fieldsSchema = z.object({
  locale: localeSchema,
  title: z.string().trim().min(1).max(80),
  translations: z.string(),
  daysBefore: z.string(),
  recipients: z.string(),
  serviceIds: z.array(z.string().uuid()).min(1).max(50),
  isEnabled: z.enum(["on", "true", "false"]).optional(),
  includeDoNotReply: z.enum(["on", "true", "false"]).optional(),
});

async function requireManager() {
  const membership = await getPrimaryMembership();
  if (!membership) return { ok: false as const, error: "unauthorized" as const };
  if (!canCreateRecords(membership.role)) {
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

function parseForm(formData: FormData) {
  return {
    locale: formData.get("locale") || "en",
    title: String(formData.get("title") || ""),
    translations: String(formData.get("translations") || "{}"),
    daysBefore: String(formData.get("daysBefore") || ""),
    recipients: String(formData.get("recipients") || "[]"),
    serviceIds: parseServiceIds(String(formData.get("serviceIds") || "[]")),
    isEnabled: formData.get("isEnabled") ? "on" : "false",
    includeDoNotReply: formData.get("includeDoNotReply") ? "on" : "false",
  };
}

function parseRecipientsJson(raw: string) {
  try {
    return parseAutomationRecipients(JSON.parse(raw));
  } catch {
    return null;
  }
}

function resolveTranslations(
  raw: string,
  orgDefault: AppLocale,
):
  | { ok: true; translations: AutomationTranslations; subject: string; body: string }
  | { ok: false; error: "invalid" | "incomplete_translation" | "missing_default_locale" } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid" };
  }
  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const locale of APP_LOCALES) {
      const entry = (parsed as Record<string, unknown>)[locale];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const subject =
        typeof (entry as { subject?: unknown }).subject === "string"
          ? (entry as { subject: string }).subject.trim()
          : "";
      const body =
        typeof (entry as { body?: unknown }).body === "string"
          ? (entry as { body: string }).body.trim()
          : "";
      if ((subject && !body) || (body && !subject)) {
        return { ok: false, error: "incomplete_translation" };
      }
    }
  }
  const translations = parseAutomationTranslations(parsed);
  const fallback = translations[orgDefault];
  if (!hasAutomationCopy(fallback) || !fallback) {
    return { ok: false, error: "missing_default_locale" };
  }
  return {
    ok: true,
    translations,
    subject: fallback.subject,
    body: fallback.body,
  };
}

async function loadOrgDefaultLocale(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
) {
  const { data } = await supabase
    .from("organizations")
    .select("default_locale")
    .eq("id", orgId)
    .maybeSingle();
  return toAppLocale(data?.default_locale);
}

async function replaceAutomationServices(input: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  automationId: string;
  serviceIds: string[];
}) {
  const { data: orgServices, error: servicesError } = await input.supabase
    .from("booking_services")
    .select("id")
    .eq("organization_id", input.orgId)
    .in("id", input.serviceIds);
  if (servicesError || (orgServices ?? []).length !== input.serviceIds.length) {
    return { error: "invalid" as const };
  }
  const { error: deleteError } = await input.supabase
    .from("booking_email_automation_services")
    .delete()
    .eq("automation_id", input.automationId)
    .eq("organization_id", input.orgId);
  if (deleteError) {
    console.error("clearAutomationServices:", deleteError.message);
    return { error: "save_failed" as const };
  }
  const { error: insertError } = await input.supabase
    .from("booking_email_automation_services")
    .insert(
      input.serviceIds.map((serviceId) => ({
        automation_id: input.automationId,
        service_id: serviceId,
        organization_id: input.orgId,
      })),
    );
  if (insertError) {
    console.error("assignAutomationServices:", insertError.message);
    return { error: "save_failed" as const };
  }
  return { ok: true as const };
}

export async function createServiceAutomationAction(
  _prev: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  const parsed = fieldsSchema.safeParse(parseForm(formData));
  if (!parsed.success) return { error: "invalid" };
  const daysBefore = parseDayOffsets(parsed.data.daysBefore);
  if (!daysBefore || daysBefore.length === 0) return { error: "invalid" };
  const recipients = parseRecipientsJson(parsed.data.recipients);
  if (!recipients) return { error: "invalid_recipients" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();
  const orgDefault = await loadOrgDefaultLocale(supabase, orgId);
  const copy = resolveTranslations(parsed.data.translations, orgDefault);
  if (!copy.ok) return { error: copy.error };

  const { data, error } = await supabase
    .from("booking_service_email_automations")
    .insert({
      organization_id: orgId,
      title: parsed.data.title,
      subject: copy.subject,
      body: copy.body,
      translations: copy.translations,
      days_before: daysBefore,
      recipients,
      is_enabled: parsed.data.isEnabled === "on",
      include_do_not_reply: parsed.data.includeDoNotReply === "on",
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createServiceAutomation:", error?.message);
    return { error: "save_failed" };
  }

  const linked = await replaceAutomationServices({
    supabase,
    orgId,
    automationId: data.id,
    serviceIds: parsed.data.serviceIds,
  });
  if ("error" in linked) return { error: linked.error };

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service_automation.create",
    resourceType: "booking_service_email_automation",
    resourceId: data.id,
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  return { message: "created" };
}

export async function updateServiceAutomationAction(
  _prev: AutomationActionState,
  formData: FormData,
): Promise<AutomationActionState> {
  const parsed = fieldsSchema
    .extend({ automationId: z.string().uuid() })
    .safeParse({
      ...parseForm(formData),
      automationId: String(formData.get("automationId") || ""),
    });
  if (!parsed.success) return { error: "invalid" };
  const daysBefore = parseDayOffsets(parsed.data.daysBefore);
  if (!daysBefore || daysBefore.length === 0) return { error: "invalid" };
  const recipients = parseRecipientsJson(parsed.data.recipients);
  if (!recipients) return { error: "invalid_recipients" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();
  const orgDefault = await loadOrgDefaultLocale(supabase, orgId);
  const copy = resolveTranslations(parsed.data.translations, orgDefault);
  if (!copy.ok) return { error: copy.error };

  const { error } = await supabase
    .from("booking_service_email_automations")
    .update({
      title: parsed.data.title,
      subject: copy.subject,
      body: copy.body,
      translations: copy.translations,
      days_before: daysBefore,
      recipients,
      is_enabled: parsed.data.isEnabled === "on",
      include_do_not_reply: parsed.data.includeDoNotReply === "on",
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.automationId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("updateServiceAutomation:", error.message);
    return { error: "save_failed" };
  }

  const linked = await replaceAutomationServices({
    supabase,
    orgId,
    automationId: parsed.data.automationId,
    serviceIds: parsed.data.serviceIds,
  });
  if ("error" in linked) return { error: linked.error };

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service_automation.update",
    resourceType: "booking_service_email_automation",
    resourceId: parsed.data.automationId,
  });

  revalidatePath(`/${parsed.data.locale}/services`);
  return { message: "saved" };
}

export async function toggleServiceAutomationAction(
  automationId: string,
  locale: string,
  enabled: boolean,
): Promise<AutomationActionState> {
  if (!z.string().uuid().safeParse(automationId).success) {
    return { error: "invalid" };
  }
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const supabase = await createClient();

  const { error } = await supabase
    .from("booking_service_email_automations")
    .update({
      is_enabled: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", automationId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("toggleServiceAutomation:", error.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${parsedLocale.data}/services`);
  return { message: "saved" };
}

export async function deleteServiceAutomationAction(
  automationId: string,
  locale: string,
): Promise<AutomationActionState> {
  if (!z.string().uuid().safeParse(automationId).success) {
    return { error: "invalid" };
  }
  const parsedLocale = localeSchema.safeParse(locale);
  if (!parsedLocale.success) return { error: "invalid" };

  const gate = await requireManager();
  if (!gate.ok) return { error: gate.error };
  const orgId = gate.membership.organization.id;
  const user = await getSessionUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("booking_service_email_automations")
    .delete()
    .eq("id", automationId)
    .eq("organization_id", orgId);
  if (error) {
    console.error("deleteServiceAutomation:", error.message);
    return { error: "save_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id,
    actorKind: "staff",
    action: "booking.service_automation.delete",
    resourceType: "booking_service_email_automation",
    resourceId: automationId,
  });

  revalidatePath(`/${parsedLocale.data}/services`);
  return { message: "deleted" };
}
