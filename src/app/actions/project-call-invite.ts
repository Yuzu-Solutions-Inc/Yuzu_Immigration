"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAppBaseUrl } from "@/lib/app-url";
import { bookingManageUrls } from "@/lib/booking/manage-url";
import {
  ensureProjectCallService,
  loadProjectCallInviteContext,
  PROJECT_CALL_INVITE_TTL_DAYS,
} from "@/lib/booking/queries";
import { isSlotStillOpen } from "@/lib/booking/slots";
import { serviceTitle } from "@/lib/booking/service-i18n";
import { createBookingToken, hashBookingToken } from "@/lib/booking/token";
import { getPrimaryMembership, getSessionUser } from "@/lib/auth/session";
import { requireOrganizationId, type PersonRow } from "@/lib/crm/queries";
import { toAppLocale } from "@/lib/i18n/locales";
import { recordAuditEvent } from "@/lib/security/audit";
import {
  decryptPersonRow,
  decryptProjectRow,
  encryptBookingGuestWrite,
  PII_AAD,
} from "@/lib/security/client-pii";
import { encryptField } from "@/lib/security/field-crypto";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

export type ScheduleCallActionState = {
  error?: string;
  message?: string;
};

export type ProjectCallBookState = {
  error?: string;
  message?: string;
  appointmentId?: string;
  startsAt?: string;
  endsAt?: string;
  serviceTitle?: string;
  hostName?: string;
  meetJoinUrl?: string;
  manageToken?: string;
};

const scheduleSchema = z.object({
  locale: z.enum(["en", "fr", "es"]),
  projectId: z.string().uuid(),
});

const bookSchema = z.object({
  token: z.string().min(16).max(200),
  locale: z.enum(["en", "fr", "es"]),
  startsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  endsAt: z.string().refine((value) => Number.isFinite(Date.parse(value))),
});

async function resolveCallHostUserId(input: {
  orgId: string;
  preferredHostIds: Array<string | null | undefined>;
}) {
  const admin = createServiceClient();
  const { data: rules } = await admin
    .from("booking_availability_rules")
    .select("user_id")
    .eq("organization_id", input.orgId);
  const withRules = new Set(
    (rules ?? []).map((row) => row.user_id as string),
  );
  if (withRules.size === 0) return null;

  for (const candidate of input.preferredHostIds) {
    if (candidate && withRules.has(candidate)) return candidate;
  }
  return [...withRules][0] ?? null;
}

export async function sendProjectCallInviteAction(
  _prev: ScheduleCallActionState,
  formData: FormData,
): Promise<ScheduleCallActionState> {
  const parsed = scheduleSchema.safeParse({
    locale: toAppLocale(String(formData.get("locale") || "en")),
    projectId: String(formData.get("projectId") || ""),
  });
  if (!parsed.success) return { error: "invalid" };

  const orgId = await requireOrganizationId();
  if (!orgId) return { error: "unauthorized" };

  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  const supabase = await createClient();

  if (!membership) return { error: "unauthorized" };

  const { data: project, error: projectError } = await supabase
    .from("immigration_projects")
    .select("id, title, representative_user_id, organization_id")
    .eq("id", parsed.data.projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (projectError || !project) return { error: "not_found" };

  const { data: settings } = await supabase
    .from("booking_settings")
    .select("id")
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!settings) return { error: "booking_not_configured" };

  const { data: principalLink } = await supabase
    .from("project_participants")
    .select("person_id")
    .eq("project_id", parsed.data.projectId)
    .eq("organization_id", orgId)
    .eq("role", "principal")
    .is("left_at", null)
    .maybeSingle();
  if (!principalLink?.person_id) return { error: "no_principal" };

  const { data: personRow } = await supabase
    .from("people")
    .select("*")
    .eq("id", principalLink.person_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!personRow) return { error: "no_principal" };

  const dek = await getOrgDataKey(orgId);
  const person = decryptPersonRow(personRow as PersonRow, dek);
  if (!person.email?.trim()) return { error: "no_email" };

  const hostUserId = await resolveCallHostUserId({
    orgId,
    preferredHostIds: [
      project.representative_user_id as string | null,
      user?.id,
    ],
  });
  if (!hostUserId) return { error: "no_availability" };

  const service = await ensureProjectCallService(orgId);
  if (!service) return { error: "service_failed" };

  const { data: hostProfile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", hostUserId)
    .maybeSingle();
  const hostName =
    hostProfile?.full_name?.trim() ||
    hostProfile?.email ||
    "Consultant";

  const { data: org } = await supabase
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const organizationName = org?.name || "Yuzu Immigration";
  const projectTitle = decryptProjectRow(
    { id: project.id as string, title: project.title as string },
    dek,
  ).title;

  const token = createBookingToken();
  const expiresAt = new Date(
    Date.now() + PROJECT_CALL_INVITE_TTL_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const tokenEncrypted = encryptField(
    token,
    PII_AAD.bookingInvites.token,
    dek,
  );

  const { data: invite, error: inviteError } = await supabase
    .from("project_booking_invites")
    .insert({
      organization_id: orgId,
      project_id: parsed.data.projectId,
      person_id: person.id,
      host_user_id: hostUserId,
      service_id: service.id,
      token_hash: hashBookingToken(token),
      token_encrypted: tokenEncrypted,
      expires_at: expiresAt,
      emailed_to: person.email.trim(),
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (inviteError || !invite) {
    console.error("sendProjectCallInvite:", inviteError?.message);
    return { error: "send_failed" };
  }

  const base = await getAppBaseUrl();
  const bookUrl = `${base}/${parsed.data.locale}/book/call/${token}`;
  const guestName = `${person.first_name} ${person.last_name}`.trim();

  const { sendProjectCallInviteEmail } = await import(
    "@/lib/email/project-call-invite"
  );
  const sent = await sendProjectCallInviteEmail({
    locale: person.preferred_locale || parsed.data.locale,
    to: person.email.trim(),
    guestName,
    organizationName,
    hostName,
    projectTitle,
    bookUrl,
    expiresAt,
  });

  if (!sent.sent) {
    await supabase
      .from("project_booking_invites")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", invite.id);
    return { error: "email_failed" };
  }

  await recordAuditEvent({
    organizationId: orgId,
    actorUserId: user?.id ?? null,
    actorKind: "staff",
    action: "project_booking_invite.create",
    resourceType: "immigration_project",
    resourceId: parsed.data.projectId,
    metadata: { inviteId: invite.id, hostUserId },
  });

  revalidatePath(`/${parsed.data.locale}/projects/${parsed.data.projectId}`);
  return { message: "sent" };
}

export async function submitProjectCallBookingAction(
  _prev: ProjectCallBookState,
  formData: FormData,
): Promise<ProjectCallBookState> {
  const parsed = bookSchema.safeParse({
    token: String(formData.get("token") || ""),
    locale: toAppLocale(String(formData.get("locale") || "en")),
    startsAt: String(formData.get("startsAt") || ""),
    endsAt: String(formData.get("endsAt") || ""),
  });
  if (!parsed.success) return { error: "invalid" };

  const ctx = await loadProjectCallInviteContext(parsed.data.token);
  if (!ctx) return { error: "unavailable" };
  if (ctx.status === "used") return { error: "already_used" };
  if (ctx.status === "expired") return { error: "expired" };
  if (ctx.status === "revoked") return { error: "revoked" };
  if (!ctx.guestEmail) return { error: "unavailable" };

  const open = isSlotStillOpen({
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    durationMinutes: ctx.service.duration_minutes,
    rules: ctx.host.rules,
    blocked: ctx.host.blocked,
    busy: ctx.host.busy,
    window: {
      timezone: ctx.settings.timezone,
      bookingWindowDays: ctx.settings.booking_window_days,
      minNoticeHours: ctx.settings.min_notice_hours,
      bufferMinutes: ctx.settings.buffer_minutes,
    },
  });
  if (!open) return { error: "slot_taken" };

  const expectedEnd = new Date(
    new Date(parsed.data.startsAt).getTime() +
      ctx.service.duration_minutes * 60_000,
  ).toISOString();
  if (expectedEnd !== parsed.data.endsAt) return { error: "slot_taken" };

  const dek = await getOrgDataKey(ctx.organizationId);
  const admin = createServiceClient();
  const manageToken = createBookingToken();
  const guestName =
    `${ctx.guestFirstName} ${ctx.guestLastName}`.trim() || ctx.guestEmail;

  const { data: appointment, error } = await admin
    .from("booking_appointments")
    .insert({
      organization_id: ctx.organizationId,
      service_id: ctx.service.id,
      person_id: ctx.personId,
      project_id: ctx.projectId,
      host_user_id: ctx.host.userId,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      ...encryptBookingGuestWrite(
        {
          guest_name: guestName,
          guest_email: ctx.guestEmail,
          guest_phone: ctx.guestPhone?.trim() || "—",
          guest_address: "—",
        },
        dek,
      ),
      privacy_accepted_at: new Date().toISOString(),
      guest_preferred_locale: toAppLocale(ctx.guestPreferredLocale),
      status: "confirmed",
      manage_token_hash: hashBookingToken(manageToken),
      form_answers: null,
    })
    .select("id")
    .single();

  if (error || !appointment) {
    if (error?.code === "23P01" || error?.message?.includes("no_overlap")) {
      return { error: "slot_taken" };
    }
    console.error("project call booking insert:", error?.message);
    return { error: "book_failed" };
  }

  const { data: consumed, error: consumeError } = await admin
    .from("project_booking_invites")
    .update({ appointment_id: appointment.id })
    .eq("id", ctx.inviteId)
    .is("appointment_id", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();

  if (consumeError || !consumed) {
    await admin
      .from("booking_appointments")
      .delete()
      .eq("id", appointment.id)
      .eq("organization_id", ctx.organizationId);
    return { error: "already_used" };
  }

  await recordAuditEvent({
    organizationId: ctx.organizationId,
    actorKind: "public_booking",
    action: "booking.appointment.create",
    resourceType: "booking_appointment",
    resourceId: appointment.id,
    metadata: {
      serviceId: ctx.service.id,
      projectId: ctx.projectId,
      inviteId: ctx.inviteId,
    },
  });

  const origin = await getAppBaseUrl();
  const preferredLocale = toAppLocale(ctx.guestPreferredLocale);
  const localizedTitle = serviceTitle(ctx.service, preferredLocale);
  const urls = bookingManageUrls(origin, preferredLocale, manageToken);

  const { pushAppointmentToGoogleCalendar } = await import(
    "@/lib/google/calendar"
  );
  const google = await pushAppointmentToGoogleCalendar({
    organizationId: ctx.organizationId,
    hostUserId: ctx.host.userId,
    appointmentId: appointment.id,
    title: `${localizedTitle} — ${guestName}`,
    description: `Project call via Yuzu Immigration\n${guestName}\n${ctx.guestEmail}\nProject: ${ctx.projectTitle}`,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
  });
  const meetJoinUrl = google?.meetJoinUrl ?? null;

  after(async () => {
    const { sendBookingConfirmationEmail } = await import(
      "@/lib/email/booking-confirmation"
    );
    await sendBookingConfirmationEmail({
      locale: preferredLocale,
      to: ctx.guestEmail,
      guestName,
      organizationName: ctx.organizationName,
      hostName: ctx.host.name,
      serviceTitle: localizedTitle,
      startsAt: parsed.data.startsAt,
      timezone: ctx.settings.timezone,
      meetJoinUrl,
      manageUrl: urls.manageUrl,
      cancelUrl: urls.cancelUrl,
    });
  });

  return {
    message: "booked",
    appointmentId: appointment.id,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
    serviceTitle: localizedTitle,
    hostName: ctx.host.name,
    meetJoinUrl: meetJoinUrl ?? undefined,
    manageToken,
  };
}
