import { decryptPersonRow } from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createServiceClient } from "@/lib/supabase/admin";

import {
  getOrgSageConnection,
  type SageConnectionRow,
  type SageContact,
} from "./client";
import {
  createSageContact,
  getSageContact,
  listSageContacts,
  matchSageContact,
  sageContactCountry,
  sageContactHasMainAddress,
  sageContactRegion,
  updateSageContact,
  type SageMainAddress,
} from "./contacts";

type PersonSageFields = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  sage_contact_id: string | null;
  sage_has_main_address: boolean;
  sage_address_country: string | null;
  sage_address_region: string | null;
};

function sagePatchFromContact(contact: SageContact) {
  const hasAddress = sageContactHasMainAddress(contact);
  return {
    sage_contact_id: contact.id ?? null,
    sage_has_main_address: hasAddress,
    sage_address_country: hasAddress
      ? sageContactCountry(contact.main_address)
      : null,
    sage_address_region: hasAddress
      ? sageContactRegion(contact.main_address)
      : null,
    updated_at: new Date().toISOString(),
  };
}

async function loadDecryptedPerson(
  organizationId: string,
  personId: string,
): Promise<PersonSageFields | null> {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("people")
    .select(
      "id, first_name, last_name, email, phone, sage_contact_id, sage_has_main_address, sage_address_country, sage_address_region",
    )
    .eq("id", personId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("loadDecryptedPerson:", error.message);
    return null;
  }
  if (!data) return null;
  const dek = await getOrgDataKey(organizationId);
  const decrypted = decryptPersonRow(data, dek);
  return {
    id: decrypted.id as string,
    first_name: decrypted.first_name as string,
    last_name: decrypted.last_name as string,
    email: (decrypted.email as string | null) ?? null,
    phone: (decrypted.phone as string | null) ?? null,
    sage_contact_id: (data.sage_contact_id as string | null) ?? null,
    sage_has_main_address: Boolean(data.sage_has_main_address),
    sage_address_country: (data.sage_address_country as string | null) ?? null,
    sage_address_region: (data.sage_address_region as string | null) ?? null,
  };
}

async function savePersonSage(
  organizationId: string,
  personId: string,
  contact: SageContact,
) {
  if (!contact.id) return;
  const admin = createServiceClient();
  const { error } = await admin
    .from("people")
    .update(sagePatchFromContact(contact))
    .eq("id", personId)
    .eq("organization_id", organizationId);
  if (error) console.error("savePersonSage:", error.message);
}

export async function linkOrCreateSageContactForPerson(input: {
  organizationId: string;
  personId: string;
  contacts?: SageContact[];
  connection?: SageConnectionRow | null;
  address?: SageMainAddress | null;
}): Promise<SageContact | null> {
  const connection =
    input.connection ?? (await getOrgSageConnection(input.organizationId));
  if (!connection) return null;

  const person = await loadDecryptedPerson(input.organizationId, input.personId);
  if (!person) return null;

  const name = `${person.first_name} ${person.last_name}`.trim();
  try {
    if (person.sage_contact_id) {
      const existing = await getSageContact(connection, person.sage_contact_id);
      if (existing?.id) {
        const updated = await updateSageContact(connection, existing, {
          name,
          email: person.email,
          phone: person.phone,
          address: input.address,
        });
        await savePersonSage(input.organizationId, person.id, updated);
        return updated;
      }
    }

    const contacts = input.contacts ?? (await listSageContacts(connection));
    const matched = matchSageContact({
      email: person.email,
      firstName: person.first_name,
      lastName: person.last_name,
      contacts,
    });
    if (matched?.id) {
      const updated = await updateSageContact(connection, matched, {
        name,
        email: person.email,
        phone: person.phone,
        address: input.address,
      });
      await savePersonSage(input.organizationId, person.id, updated);
      return updated;
    }

    const created = await createSageContact(connection, {
      name,
      email: person.email,
      phone: person.phone,
      address: input.address,
    });
    await savePersonSage(input.organizationId, person.id, created);
    return created;
  } catch (error) {
    console.error("linkOrCreateSageContactForPerson:", error);
    return null;
  }
}

export async function matchExistingSageContactsForOrg(organizationId: string) {
  const connection = await getOrgSageConnection(organizationId);
  if (!connection) return { linked: 0 };

  const contacts = await listSageContacts(connection);
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("people")
    .select(
      "id, first_name, last_name, email, sage_contact_id, sage_has_main_address",
    )
    .eq("organization_id", organizationId)
    .is("sage_contact_id", null);
  if (error) {
    console.error("matchExistingSageContactsForOrg:", error.message);
    return { linked: 0 };
  }

  const dek = await getOrgDataKey(organizationId);
  let linked = 0;
  for (const row of data ?? []) {
    const person = decryptPersonRow(row, dek);
    const matched = matchSageContact({
      email: (person.email as string | null) ?? null,
      firstName: person.first_name as string,
      lastName: person.last_name as string,
      contacts,
    });
    if (!matched?.id) continue;
    await savePersonSage(organizationId, person.id as string, matched);
    linked += 1;
  }
  return { linked };
}
