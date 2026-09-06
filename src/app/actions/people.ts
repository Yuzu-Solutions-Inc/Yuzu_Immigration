"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getSessionUser, getPrimaryMembership } from "@/lib/auth/session";
import { canCreateRecords, canDeleteRecord } from "@/lib/auth/rbac";
import {
  isTrialExpiredDbError,
  trialExpiredError,
} from "@/lib/billing/trial";
import {
  revalidateContactPaths,
  partnerDetailPath,
} from "@/lib/crm/contact-paths";
import {
  ensurePersonForPartner,
  partnerLegalName,
  syncPartnerFromPerson,
} from "@/lib/crm/partner-person";
import { personStatusAllowsExpiry } from "@/lib/crm/person-status";
import { erasePersonPersonalData } from "@/lib/privacy/erase";
import { recordAuditEvent } from "@/lib/security/audit";
import { encryptNoteBody, encryptPersonWrite } from "@/lib/security/client-pii";
import { personLookupWrite } from "@/lib/security/email-lookup";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";

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
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };
  const orgId = membership.organization.id;
  const user = await getSessionUser();
  if (!user) {
    redirect(`/${data.locale}/login`);
  }

  const supabase = await createClient();
  const statusExpiresAt =
    personStatusAllowsExpiry(data.immigrationStatus) && data.statusExpiresAt
      ? data.statusExpiresAt
      : null;
  const legalName = partnerLegalName(data.firstName, data.lastName);
  const email = data.email || null;

  const { data: partner, error: partnerError } = await supabase
    .from("partners")
    .insert({
      organization_id: orgId,
      user_id: user.id,
      legal_name: legalName,
      kind: "customer",
      contact_name: legalName,
      email,
      phone: data.phone || null,
      immigration_status: data.immigrationStatus,
      status_expires_at: statusExpiresAt,
      preferred_locale: data.preferredLocale,
    })
    .select("id")
    .single();

  if (partnerError || !partner) {
    console.error("create partner for person:", partnerError?.message);
    if (isTrialExpiredDbError(partnerError)) return { error: "trial_expired" };
    return { error: "create_failed" };
  }

  const key = await getOrgDataKey(orgId);
  const { data: created, error: createError } = await supabase
    .from("people")
    .insert({
      organization_id: orgId,
      partner_id: partner.id,
      ...encryptPersonWrite(
        {
          first_name: data.firstName,
          last_name: data.lastName,
          email,
          phone: data.phone || null,
        },
        key,
      ),
      ...personLookupWrite(
        orgId,
        {
          first_name: data.firstName,
          last_name: data.lastName,
          email,
        },
        key,
      ),
      preferred_locale: data.preferredLocale,
      immigration_status: data.immigrationStatus,
      status_expires_at: statusExpiresAt,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("create person:", createError?.message);
    await supabase
      .from("partners")
      .delete()
      .eq("id", partner.id)
      .eq("organization_id", orgId);
    if (isTrialExpiredDbError(createError)) return { error: "trial_expired" };
    return { error: "create_failed" };
  }

  after(async () => {
    const { linkOrCreateSageContactForPerson } = await import(
      "@/lib/sage/sync-people"
    );
    await linkOrCreateSageContactForPerson({
      organizationId: orgId,
      personId: created.id,
    });
  });

  revalidateContactPaths(data.locale, partner.id);
  redirect(`/${data.locale}${partnerDetailPath(partner.id)}`);
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
  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${data.locale}/onboarding`);
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };
  const orgId = membership.organization.id;

  const supabase = await createClient();
  const statusExpiresAt =
    personStatusAllowsExpiry(data.immigrationStatus) && data.statusExpiresAt
      ? data.statusExpiresAt
      : null;

  const user = await getSessionUser();
  if (!user) {
    redirect(`/${data.locale}/login`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("people")
    .select("id, partner_id")
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
    if (isTrialExpiredDbError(updateError)) return { error: "trial_expired" };
    return { error: "update_failed" };
  }

  after(async () => {
    const { linkOrCreateSageContactForPerson } = await import(
      "@/lib/sage/sync-people"
    );
    await linkOrCreateSageContactForPerson({
      organizationId: orgId,
      personId: data.personId,
    });
  });

  const partnerId = await syncPartnerFromPerson(
    { supabase, orgId, userId: user.id },
    data.personId,
  );

  revalidateContactPaths(data.locale, partnerId ?? existing.partner_id);
  redirect(
    `/${data.locale}${partnerDetailPath(partnerId ?? existing.partner_id ?? data.personId)}`,
  );
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
    .select("id, created_by, partner_id")
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

  revalidateContactPaths(data.locale, existing.partner_id as string | null);
  revalidatePath(`/${data.locale}/calendar`);
  redirect(`/${data.locale}/partners`);
}

function encryptNoteBodyOrEmpty(body: string, key: Buffer) {
  const trimmed = body.trim();
  return trimmed ? encryptNoteBody(trimmed, key) : "";
}

const addPersonNoteSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  personId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
  appointmentId: z.string().uuid().optional().or(z.literal("")),
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
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${data.locale}/onboarding`);
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };
  const orgId = membership.organization.id;

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
      revalidateContactPaths(data.locale);
      return { message: "saved" };
    }

    insert = { ...insert, appointment_id: appointmentId };
  }

  const { error: insertError } = await supabase.from("person_notes").insert(insert);

  if (insertError) {
    console.error("add person note:", insertError.message);
    return { error: "save_failed" };
  }

  revalidateContactPaths(data.locale);
  return { message: "saved" };
}

const updatePersonNoteSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  personId: z.string().uuid(),
  noteId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
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
  });

  if (!parsed.success) {
    return { error: "invalid" };
  }

  const { data } = parsed;
  const membership = await getPrimaryMembership();
  if (!membership) {
    redirect(`/${data.locale}/onboarding`);
  }
  const locked = trialExpiredError(membership);
  if (locked) return { error: locked };
  const orgId = membership.organization.id;

  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from("person_notes")
    .select("id")
    .eq("id", data.noteId)
    .eq("person_id", data.personId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (existingError || !existing) {
    return { error: "not_found" };
  }

  const patch = {
    body: encryptNoteBodyOrEmpty(data.body, await getOrgDataKey(orgId)),
    updated_at: new Date().toISOString(),
  };

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

  revalidateContactPaths(data.locale);
  return { message: "updated" };
}

const enableImmigrationProfileSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  partnerId: z.string().uuid(),
});

export async function enableImmigrationProfileAction(formData: FormData) {
  const parsed = enableImmigrationProfileSchema.safeParse({
    locale: formData.get("locale") || "en",
    partnerId: String(formData.get("partnerId") || ""),
  });
  if (!parsed.success) {
    redirect("/en/partners");
  }

  const { locale, partnerId } = parsed.data;
  const membership = await getPrimaryMembership();
  const user = await getSessionUser();
  if (!membership || !user) {
    redirect(`/${locale}/onboarding`);
  }

  const supabase = await createClient();
  const personId = await ensurePersonForPartner(
    {
      supabase,
      orgId: membership.organization.id,
      userId: user.id,
    },
    partnerId,
  );
  if (!personId) {
    redirect(`/${locale}${partnerDetailPath(partnerId)}`);
  }
  revalidateContactPaths(locale, partnerId);
  redirect(`/${locale}${partnerDetailPath(partnerId)}`);
}

