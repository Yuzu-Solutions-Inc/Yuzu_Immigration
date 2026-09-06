import type { SupabaseClient } from "@supabase/supabase-js";

import {
  asImmigrationStatus,
  partnerLegalName,
  splitDisplayName,
} from "@/lib/crm/partner-person-names";
import {
  decryptPersonRow,
  encryptPersonWrite,
} from "@/lib/security/client-pii";
import { personLookupWrite } from "@/lib/security/email-lookup";
import { getOrgDataKey } from "@/lib/security/org-data-key";

export {
  asImmigrationStatus,
  partnerLegalName,
  shouldSyncImmigrationPerson,
  splitDisplayName,
} from "@/lib/crm/partner-person-names";

export type PartnerPersonClient = SupabaseClient;

type PartnerPersonCtx = {
  supabase: PartnerPersonClient;
  orgId: string;
  userId: string;
};

const PERSON_SELECT =
  "id, partner_id, first_name, last_name, email, phone, preferred_locale, immigration_status, status_expires_at";

function preferredLocaleFromPartner(partner: {
  preferred_locale?: string | null;
  language?: string | null;
}) {
  if (
    partner.preferred_locale === "en" ||
    partner.preferred_locale === "fr" ||
    partner.preferred_locale === "es"
  ) {
    return partner.preferred_locale;
  }
  return partner.language === "en" ? "en" : "fr";
}

export async function ensurePartnerForPerson(
  ctx: PartnerPersonCtx,
  personId: string,
): Promise<string | null> {
  const { supabase, orgId, userId } = ctx;
  const { data: person, error } = await supabase
    .from("people")
    .select(PERSON_SELECT)
    .eq("organization_id", orgId)
    .eq("id", personId)
    .maybeSingle();

  if (error || !person) {
    if (error) console.error("ensurePartnerForPerson:", error.message);
    return null;
  }
  if (person.partner_id) return person.partner_id as string;

  const key = await getOrgDataKey(orgId);
  const decrypted = decryptPersonRow(
    person as {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    },
    key,
  );
  const legalName = partnerLegalName(decrypted.first_name, decrypted.last_name);

  const { data: created, error: createError } = await supabase
    .from("partners")
    .insert({
      organization_id: orgId,
      user_id: userId,
      legal_name: legalName,
      kind: "customer",
      contact_name: legalName,
      email: decrypted.email,
      phone: decrypted.phone,
      immigration_status: asImmigrationStatus(
        person.immigration_status as string | null,
      ),
      status_expires_at: person.status_expires_at,
      preferred_locale: person.preferred_locale ?? "en",
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("ensurePartnerForPerson create:", createError?.message);
    return null;
  }

  const { error: linkError } = await supabase
    .from("people")
    .update({
      partner_id: created.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId)
    .eq("organization_id", orgId);

  if (linkError) {
    console.error("ensurePartnerForPerson link:", linkError.message);
  }

  return created.id as string;
}

export async function ensurePersonForPartner(
  ctx: PartnerPersonCtx,
  partnerId: string,
): Promise<string | null> {
  const { supabase, orgId, userId } = ctx;
  const { data: existing } = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", orgId)
    .eq("partner_id", partnerId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: partner, error } = await supabase
    .from("partners")
    .select(
      "id, legal_name, contact_name, email, phone, preferred_locale, immigration_status, status_expires_at, language",
    )
    .eq("organization_id", orgId)
    .eq("id", partnerId)
    .maybeSingle();

  if (error || !partner) {
    if (error) console.error("ensurePersonForPartner:", error.message);
    return null;
  }

  const { firstName, lastName } = splitDisplayName(
    partner.legal_name as string,
    partner.contact_name as string | null,
  );
  const key = await getOrgDataKey(orgId);
  const email = (partner.email as string | null) || null;
  const immigrationStatus = asImmigrationStatus(
    partner.immigration_status as string | null,
  );

  const { data: created, error: createError } = await supabase
    .from("people")
    .insert({
      organization_id: orgId,
      partner_id: partnerId,
      ...encryptPersonWrite(
        {
          first_name: firstName,
          last_name: lastName,
          email,
          phone: (partner.phone as string | null) || null,
        },
        key,
      ),
      ...personLookupWrite(
        orgId,
        { first_name: firstName, last_name: lastName, email },
        key,
      ),
      preferred_locale: preferredLocaleFromPartner(partner),
      immigration_status: immigrationStatus,
      status_expires_at:
        immigrationStatus === "none" ? null : partner.status_expires_at,
      created_by: userId,
    })
    .select("id")
    .single();

  if (createError || !created) {
    console.error("ensurePersonForPartner create:", createError?.message);
    return null;
  }

  return created.id as string;
}

export async function syncPartnerFromPerson(
  ctx: PartnerPersonCtx,
  personId: string,
): Promise<string | null> {
  const partnerId = await ensurePartnerForPerson(ctx, personId);
  if (!partnerId) return null;

  const { supabase, orgId } = ctx;
  const { data: person, error } = await supabase
    .from("people")
    .select(PERSON_SELECT)
    .eq("organization_id", orgId)
    .eq("id", personId)
    .maybeSingle();
  if (error || !person) return partnerId;

  const key = await getOrgDataKey(orgId);
  const decrypted = decryptPersonRow(
    person as {
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
    },
    key,
  );
  const legalName = partnerLegalName(decrypted.first_name, decrypted.last_name);

  const { error: updateError } = await supabase
    .from("partners")
    .update({
      legal_name: legalName,
      contact_name: legalName,
      email: decrypted.email,
      phone: decrypted.phone,
      immigration_status: asImmigrationStatus(
        person.immigration_status as string | null,
      ),
      status_expires_at: person.status_expires_at,
      preferred_locale: person.preferred_locale ?? "en",
      updated_at: new Date().toISOString(),
    })
    .eq("id", partnerId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("syncPartnerFromPerson:", updateError.message);
  }

  return partnerId;
}

export async function syncPersonFromPartner(
  ctx: PartnerPersonCtx,
  partnerId: string,
  options?: { createIfMissing?: boolean },
): Promise<string | null> {
  const { supabase, orgId } = ctx;
  const createIfMissing = options?.createIfMissing ?? true;

  const { data: existing } = await supabase
    .from("people")
    .select("id")
    .eq("organization_id", orgId)
    .eq("partner_id", partnerId)
    .maybeSingle();

  let personId = (existing?.id as string | undefined) ?? null;
  if (!personId) {
    if (!createIfMissing) return null;
    personId = await ensurePersonForPartner(ctx, partnerId);
    return personId;
  }

  const { data: partner, error } = await supabase
    .from("partners")
    .select(
      "legal_name, contact_name, email, phone, preferred_locale, immigration_status, status_expires_at, language",
    )
    .eq("organization_id", orgId)
    .eq("id", partnerId)
    .maybeSingle();
  if (error || !partner) return personId;

  const { firstName, lastName } = splitDisplayName(
    partner.legal_name as string,
    partner.contact_name as string | null,
  );
  const key = await getOrgDataKey(orgId);
  const email = (partner.email as string | null) || null;
  const immigrationStatus = asImmigrationStatus(
    partner.immigration_status as string | null,
  );

  const { error: updateError } = await supabase
    .from("people")
    .update({
      ...encryptPersonWrite(
        {
          first_name: firstName,
          last_name: lastName,
          email,
          phone: (partner.phone as string | null) || null,
        },
        key,
      ),
      ...personLookupWrite(
        orgId,
        { first_name: firstName, last_name: lastName, email },
        key,
      ),
      preferred_locale: preferredLocaleFromPartner(partner),
      immigration_status: immigrationStatus,
      status_expires_at:
        immigrationStatus === "none" ? null : partner.status_expires_at,
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId)
    .eq("organization_id", orgId);

  if (updateError) {
    console.error("syncPersonFromPartner:", updateError.message);
  }

  return personId;
}
