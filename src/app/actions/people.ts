"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser, getPrimaryMembership } from "@/lib/auth/session";
import { canCreateRecords, canDeleteRecord } from "@/lib/auth/rbac";
import { requireOrganizationId } from "@/lib/crm/queries";
import { personStatusAllowsExpiry } from "@/lib/crm/person-status";
import { erasePersonPersonalData } from "@/lib/privacy/erase";
import { recordAuditEvent } from "@/lib/security/audit";
import { encryptNoteBody, encryptPersonWrite } from "@/lib/security/client-pii";
import { personLookupWrite } from "@/lib/security/email-lookup";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";
import { zonedCivilToUtc } from "@/lib/booking/timezone";
import type { BookingAppointmentStatus } from "@/db/schema";

const personFieldsSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  preferredLocale: z.enum(["en", "fr", "es"]),
  immigrationStatus: z.enum([
    "none",
    "visitor",
    "student",
    "worker",
    "maintained",
    "permanent_resident",
    "canadian_citizen",
    "refugee_claimant",
    "protected_person",
    "overstay",
    "other",
  ]),
  statusExpiresAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal("")),
});

const createPersonSchema = personFieldsSchema;

const updatePersonSchema = personFieldsSchema.extend({
  personId: z.string().uuid(),
});

export type CreatePersonState = {
  error?: string;
};

export type UpdatePersonState = {
  error?: string;
};

function parsePersonFields(formData: FormData) {
  return {
    locale: formData.get("locale") || "en",
    firstName: String(formData.get("firstName") || ""),
    lastName: String(formData.get("lastName") || ""),
    email: String(formData.get("email") || ""),
    phone: String(formData.get("phone") || ""),
    preferredLocale: formData.get("preferredLocale") || "en",
    immigrationStatus: formData.get("immigrationStatus") || "none",
    statusExpiresAt: String(formData.get("statusExpiresAt") || ""),
  };
}

export async function createPersonAction(
  _prev: CreatePersonState,
  formData: FormData,
): Promise<CreatePersonState> {
  const parsed = createPersonSchema.safeParse(parsePersonFields(formData));

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${data.locale}/onboarding`);
  }
  if (!canCreateRecords(membership.role)) {
    return { error: "forbidden" };
  }
  const orgId = membership.organization.id;
  const user = await getSessionUser();

  const supabase = await createClient();
  const statusExpiresAt =
    personStatusAllowsExpiry(data.immigrationStatus) && data.statusExpiresAt
      ? data.statusExpiresAt
      : null;

  const key = await getOrgDataKey(orgId);
  const { data: created, error: createError } = await supabase
    .from("people")
    .insert({
      organization_id: orgId,
      ...encryptPersonWrite(
        {
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
        },
        key,
      ),
      ...personLookupWrite(
        orgId,
        {
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email || null,
        },
        key,
      ),
      preferred_locale: data.preferredLocale,
      immigration_status: data.immigrationStatus,
      status_expires_at: statusExpiresAt,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("create person:", createError?.message);
    return { error: "create_failed" };
  }

  revalidatePath(`/${data.locale}/people`);
  revalidatePath(`/${data.locale}/people/${created.id}`);
  revalidatePath(`/${data.locale}/home`);
  revalidatePath(`/${data.locale}/projects`);
  redirect(`/${data.locale}/people/${created.id}`);
}

export async function updatePersonAction(
  _prev: UpdatePersonState,
  formData: FormData,
): Promise<UpdatePersonState> {
  const parsed = updatePersonSchema.safeParse({
    ...parsePersonFields(formData),
    personId: String(formData.get("personId") || ""),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

  const supabase = await createClient();
  const statusExpiresAt =
    personStatusAllowsExpiry(data.immigrationStatus) && data.statusExpiresAt
      ? data.statusExpiresAt
      : null;

  const { data: existing, error: existingError } = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", data.personId)
    .maybeSingle();

  if (existingError || !existing) {
    return { error: "not_found" };
  }

  const key = await getOrgDataKey(orgId);
  const { error: updateError } = await supabase
    .from("people")
    .update({
      ...encryptPersonWrite(
        {
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email || null,
          phone: data.phone || null,
        },
        key,
      ),
      ...personLookupWrite(
        orgId,
        {
          first_name: data.firstName,
          last_name: data.lastName,
          email: data.email || null,
        },
        key,
      ),
      preferred_locale: data.preferredLocale,
      immigration_status: data.immigrationStatus,
      status_expires_at: statusExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.personId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("update person:", updateError.message);
    return { error: "update_failed" };
  }

  revalidatePath(`/${data.locale}/people/${data.personId}`);
  revalidatePath(`/${data.locale}/people`);
  revalidatePath(`/${data.locale}/home`);
  revalidatePath(`/${data.locale}/projects`);
  redirect(`/${data.locale}/people/${data.personId}`);
}

const deletePersonSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  personId: z.string().uuid(),
});

export type DeletePersonState = {
  error?: string;
};

export async function deletePersonAction(
  _prev: DeletePersonState,
  formData: FormData,
): Promise<DeletePersonState> {
  const parsed = deletePersonSchema.safeParse({
    locale: formData.get("locale") || "en",
    personId: String(formData.get("personId") || ""),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership) {
    redirect(`/${data.locale}/onboarding`);
  }
  const orgId = membership.organization.id;

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("people")
    .select("id, created_by")
    .eq("organization_id", orgId)
    .eq("id", data.personId)
    .maybeSingle();

  if (existingError || !existing) {
    return { error: "not_found" };
  }

  if (
    !canDeleteRecord({
      role: membership.role,
      createdBy: existing.created_by as string | null,
      actorUserId: user?.id,
    })
  ) {
    return { error: "forbidden" };
  }

  try {
    const summary = await erasePersonPersonalData({
      organizationId: orgId,
      personId: data.personId,
      actorUserId: user?.id ?? null,
    });

    await recordAuditEvent({
      organizationId: orgId,
      actorUserId: user?.id,
      actorKind: "staff",
      action: "person.delete",
      resourceType: "person",
      resourceId: data.personId,
      metadata: {
        documentsRemoved: summary.documentsRemoved,
        appointmentsRemoved: summary.appointmentsRemoved,
      },
    });
  } catch (error) {
    console.error("delete person:", error);
    return { error: "delete_failed" };
  }

  revalidatePath(`/${data.locale}/people`);
  revalidatePath(`/${data.locale}/people/${data.personId}`);
  revalidatePath(`/${data.locale}/home`);
  revalidatePath(`/${data.locale}/projects`);
  revalidatePath(`/${data.locale}/calendar`);
  redirect(`/${data.locale}/people`);
}

const meetingStatusSchema = z.enum([
  "confirmed",
  "cancelled",
  "completed",
  "no_show",
]);
const datetimeLocalSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/);

function encryptNoteBodyOrEmpty(body: string, key: Buffer) {
  const trimmed = body.trim();
  return trimmed ? encryptNoteBody(trimmed, key) : "";
}

function occurredAtFromForm(occurredAt: string, timeZone: string) {
  const [dateIso, timePart] = occurredAt.split("T");
  return zonedCivilToUtc(dateIso, timePart.slice(0, 5), timeZone).toISOString();
}

const addPersonNoteSchema = z
  .object({
    locale: z.enum(["en", "fr", "es"]).default("en"),
    personId: z.string().uuid(),
    body: z.string().max(20000),
    appointmentId: z.string().uuid().optional().or(z.literal("")),
    occurredAt: z.string().optional().or(z.literal("")),
    status: meetingStatusSchema.optional().or(z.literal("")),
    timeZone: z.string().trim().min(1).max(64).default("America/Toronto"),
  })
  .superRefine((data, ctx) => {
    const appointmentId = data.appointmentId?.trim();
    if (appointmentId) return;
    if (!datetimeLocalSchema.safeParse(data.occurredAt).success) {
      ctx.addIssue({ code: "custom", path: ["occurredAt"], message: "invalid" });
    }
    if (!meetingStatusSchema.safeParse(data.status).success) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "invalid" });
    }
  });

export type AddPersonNoteState = {
  error?: string;
  message?: string;
};

export async function addPersonNoteAction(
  _prev: AddPersonNoteState,
  formData: FormData,
): Promise<AddPersonNoteState> {
  const parsed = addPersonNoteSchema.safeParse({
    locale: formData.get("locale") || "en",
    personId: String(formData.get("personId") || ""),
    body: String(formData.get("body") || ""),
    appointmentId: String(formData.get("appointmentId") || ""),
    occurredAt: String(formData.get("occurredAt") || ""),
    status: String(formData.get("status") || ""),
    timeZone: String(formData.get("timeZone") || "America/Toronto"),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

  const user = await getSessionUser();
  const supabase = await createClient();
  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", orgId)
    .eq("id", data.personId)
    .maybeSingle();

  if (personError || !person) {
    return { error: "not_found" };
  }

  const appointmentId = data.appointmentId?.trim() || null;
  let insert: {
    organization_id: string;
    person_id: string;
    body: string;
    created_by: string | null;
    appointment_id?: string;
    occurred_at?: string;
    status?: BookingAppointmentStatus;
  } = {
    organization_id: orgId,
    person_id: data.personId,
    body: encryptNoteBodyOrEmpty(data.body, await getOrgDataKey(orgId)),
    created_by: user?.id ?? null,
  };

  if (appointmentId) {
    const { data: appointment, error: appointmentError } = await supabase
      .from("booking_appointments")
      .select("id")
      .eq("id", appointmentId)
      .eq("person_id", data.personId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (appointmentError || !appointment) {
      return { error: "not_found" };
    }

    const { data: existing } = await supabase
      .from("person_notes")
      .select("id")
      .eq("appointment_id", appointmentId)
      .eq("person_id", data.personId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (existing) {
      const { error: updateError } = await supabase
        .from("person_notes")
        .update({
          body: insert.body,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .eq("person_id", data.personId)
        .eq("organization_id", orgId);
      if (updateError) {
        console.error("add person note (existing meeting):", updateError.message);
        return { error: "save_failed" };
      }
      revalidatePath(`/${data.locale}/people/${data.personId}`);
      return { message: "saved" };
    }

    insert = { ...insert, appointment_id: appointmentId };
  } else {
    insert = {
      ...insert,
      occurred_at: occurredAtFromForm(data.occurredAt as string, data.timeZone),
      status: data.status as BookingAppointmentStatus,
    };
  }

  const { error: insertError } = await supabase.from("person_notes").insert(insert);

  if (insertError) {
    console.error("add person note:", insertError.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${data.locale}/people/${data.personId}`);
  return { message: "saved" };
}

const updatePersonNoteSchema = z
  .object({
    locale: z.enum(["en", "fr", "es"]).default("en"),
    personId: z.string().uuid(),
    noteId: z.string().uuid(),
    body: z.string().max(20000),
    occurredAt: z.string().optional().or(z.literal("")),
    status: meetingStatusSchema.optional().or(z.literal("")),
    timeZone: z.string().trim().min(1).max(64).default("America/Toronto"),
  })
  .superRefine((data, ctx) => {
    if (!data.occurredAt) return;
    if (!datetimeLocalSchema.safeParse(data.occurredAt).success) {
      ctx.addIssue({ code: "custom", path: ["occurredAt"], message: "invalid" });
    }
    if (data.status && !meetingStatusSchema.safeParse(data.status).success) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "invalid" });
    }
  });

export async function updatePersonNoteAction(
  _prev: AddPersonNoteState,
  formData: FormData,
): Promise<AddPersonNoteState> {
  const parsed = updatePersonNoteSchema.safeParse({
    locale: formData.get("locale") || "en",
    personId: String(formData.get("personId") || ""),
    noteId: String(formData.get("noteId") || ""),
    body: String(formData.get("body") || ""),
    occurredAt: String(formData.get("occurredAt") || ""),
    status: String(formData.get("status") || ""),
    timeZone: String(formData.get("timeZone") || "America/Toronto"),
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("person_notes")
    .select("id, appointment_id")
    .eq("id", data.noteId)
    .eq("person_id", data.personId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (existingError || !existing) {
    return { error: "not_found" };
  }

  const patch: {
    body: string;
    updated_at: string;
    occurred_at?: string;
    status?: BookingAppointmentStatus;
  } = {
    body: encryptNoteBodyOrEmpty(data.body, await getOrgDataKey(orgId)),
    updated_at: new Date().toISOString(),
  };

  if (!existing.appointment_id) {
    if (!datetimeLocalSchema.safeParse(data.occurredAt).success) {
      return { error: "invalid" };
    }
    if (!meetingStatusSchema.safeParse(data.status).success) {
      return { error: "invalid" };
    }
    patch.occurred_at = occurredAtFromForm(
      data.occurredAt as string,
      data.timeZone,
    );
    patch.status = data.status as BookingAppointmentStatus;
  }

  const { error: updateError } = await supabase
    .from("person_notes")
    .update(patch)
    .eq("id", data.noteId)
    .eq("person_id", data.personId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("update person note:", updateError.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${data.locale}/people/${data.personId}`);
  return { message: "updated" };
}
