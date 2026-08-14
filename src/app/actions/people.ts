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
  const orgId = membership.organization.id;
  const user = await getSessionUser();

  const supabase = await createClient();
  const statusExpiresAt =
    personStatusAllowsExpiry(data.immigrationStatus) && data.statusExpiresAt
      ? data.statusExpiresAt
      : null;

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
        await getOrgDataKey(orgId),
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
        await getOrgDataKey(orgId),
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

const addPersonNoteSchema = z.object({
  locale: z.enum(["en", "fr", "es"]).default("en"),
  personId: z.string().uuid(),
  body: z.string().trim().min(1).max(20000),
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

  const { error: insertError } = await supabase.from("person_notes").insert({
    organization_id: orgId,
    person_id: data.personId,
    body: encryptNoteBody(data.body, await getOrgDataKey(orgId)),
    created_by: user?.id ?? null,
  });

  if (insertError) {
    console.error("add person note:", insertError.message);
    return { error: "save_failed" };
  }

  revalidatePath(`/${data.locale}/people/${data.personId}`);
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
  const orgId = await requireOrganizationId();
  if (!orgId) {
    redirect(`/${data.locale}/onboarding`);
  }

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

  const { error: updateError } = await supabase
    .from("person_notes")
    .update({
      body: encryptNoteBody(data.body, await getOrgDataKey(orgId)),
      updated_at: new Date().toISOString(),
    })
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
