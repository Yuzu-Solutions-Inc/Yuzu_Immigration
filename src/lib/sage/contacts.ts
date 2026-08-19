import { normalizeSearchText } from "@/lib/security/email-lookup";

import {
  sageFetchJson,
  sageListAll,
  sageRefId,
  type SageAddress,
  type SageConnectionRow,
  type SageContact,
  type SageContactType,
} from "./client";
import {
  caRegionName,
  hasTaxJurisdiction,
  normalizeCaRegion,
  normalizeCountryCode,
} from "./tax-regions";

export type SageMainAddress = {
  line1: string;
  line2?: string;
  city: string;
  region: string | null;
  postalCode: string;
  country: string;
};

function contactEmail(contact: SageContact) {
  return (
    contact.email?.trim().toLowerCase() ||
    contact.main_contact?.email?.trim().toLowerCase() ||
    null
  );
}

function contactPhone(contact: SageContact) {
  return (
    contact.telephone?.trim() ||
    contact.mobile?.trim() ||
    contact.main_contact?.telephone?.trim() ||
    contact.main_contact?.mobile?.trim() ||
    null
  );
}

export function sageContactCountry(address: SageAddress | null | undefined) {
  return normalizeCountryCode(
    address?.country_id || address?.country?.id || null,
  );
}

export function sageContactRegion(address: SageAddress | null | undefined) {
  const country = sageContactCountry(address);
  const raw = address?.region?.trim() || null;
  if (country === "CA") return normalizeCaRegion(raw);
  return raw;
}

export function sageContactHasMainAddress(contact: SageContact) {
  const address = contact.main_address;
  if (!address) return false;
  const country = sageContactCountry(address);
  const line = address.address_line_1?.trim() || address.city?.trim();
  if (!country || !line) return false;
  return hasTaxJurisdiction({
    country,
    region: address.region,
  });
}

export function matchSageContact(input: {
  email?: string | null;
  firstName: string;
  lastName: string;
  contacts: SageContact[];
}): SageContact | null {
  const email = input.email?.trim().toLowerCase();
  if (!email) return null;
  const matches = input.contacts.filter(
    (contact) => contactEmail(contact) === email,
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;

  const needle = normalizeSearchText(`${input.firstName} ${input.lastName}`);
  const named = matches.find((contact) => {
    const name = normalizeSearchText(contact.name || contact.displayed_as || "");
    return name === needle || name.includes(needle) || needle.includes(name);
  });
  return named ?? matches[0] ?? null;
}

export async function listSageContacts(connection: SageConnectionRow) {
  return sageListAll<SageContact>(connection, "/contacts");
}

export async function getSageContact(
  connection: SageConnectionRow,
  contactId: string,
) {
  const data = await sageFetchJson<{ contact?: SageContact } | SageContact>(
    connection,
    `/contacts/${encodeURIComponent(contactId)}?attributes=all`,
  );
  if (data && typeof data === "object" && "contact" in data) {
    return (data as { contact?: SageContact }).contact ?? null;
  }
  return (data as SageContact | null) ?? null;
}

export async function listSageContactTypes(connection: SageConnectionRow) {
  return sageListAll<SageContactType>(connection, "/contact_types");
}

export function pickCustomerContactTypeId(types: SageContactType[]) {
  const customer = types.find((row) => {
    const label = `${row.displayed_as ?? ""} ${row.name ?? ""}`.toLowerCase();
    return label.includes("customer") || label.includes("client");
  });
  return customer?.id ?? types[0]?.id ?? null;
}

function contactWriteBody(input: {
  name: string;
  email?: string | null;
  phone?: string | null;
  contactTypeId: string;
  address?: SageMainAddress | null;
  existing?: SageContact | null;
}) {
  const email = input.email?.trim() || undefined;
  const phone = input.phone?.trim() || undefined;
  const contact: Record<string, unknown> = {
    name: input.name,
    contact_type_ids: [input.contactTypeId],
  };
  if (email) contact.email = email;
  if (phone) contact.telephone = phone;
  contact.main_contact = {
    ...(input.existing?.main_contact?.id
      ? { id: input.existing.main_contact.id }
      : {}),
    name: input.name,
    ...(email ? { email } : {}),
    ...(phone ? { telephone: phone } : {}),
  };
  if (input.address) {
    const country = normalizeCountryCode(input.address.country) ?? "CA";
    const region =
      country === "CA"
        ? caRegionName(input.address.region) || input.address.region
        : input.address.region;
    contact.main_address = {
      ...(input.existing?.main_address?.id
        ? { id: input.existing.main_address.id }
        : {}),
      address_line_1: input.address.line1,
      ...(input.address.line2 ? { address_line_2: input.address.line2 } : {}),
      city: input.address.city,
      ...(region ? { region } : {}),
      postal_code: input.address.postalCode,
      country_id: country,
    };
  }
  return { contact };
}

export async function createSageContact(
  connection: SageConnectionRow,
  input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: SageMainAddress | null;
  },
) {
  const typeId = connection.customer_contact_type_id;
  if (!typeId) throw new Error("sage_contact_type_missing");
  const result = await sageFetchJson<{ contact?: SageContact } | SageContact>(
    connection,
    "/contacts",
    {
      method: "POST",
      headers: { "Idempotency-Key": `contact-${input.email || input.name}` },
      body: JSON.stringify(
        contactWriteBody({
          ...input,
          contactTypeId: typeId,
        }),
      ),
    },
  );
  if (result && typeof result === "object" && "contact" in result) {
    return (result as { contact: SageContact }).contact;
  }
  return result as SageContact;
}

export async function updateSageContact(
  connection: SageConnectionRow,
  existing: SageContact,
  input: {
    name: string;
    email?: string | null;
    phone?: string | null;
    address?: SageMainAddress | null;
  },
) {
  const typeId =
    connection.customer_contact_type_id ||
    sageRefId(existing.contact_types?.[0]) ||
    "";
  if (!existing.id) throw new Error("sage_contact_id_missing");
  const result = await sageFetchJson<{ contact?: SageContact } | SageContact>(
    connection,
    `/contacts/${encodeURIComponent(existing.id)}`,
    {
      method: "PUT",
      body: JSON.stringify(
        contactWriteBody({
          ...input,
          contactTypeId: typeId,
          existing,
        }),
      ),
    },
  );
  if (result && typeof result === "object" && "contact" in result) {
    return (result as { contact: SageContact }).contact;
  }
  return result as SageContact;
}

export { contactEmail, contactPhone };
