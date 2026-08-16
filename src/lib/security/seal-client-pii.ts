import { CLIENT_DOCUMENTS_BUCKET } from "@/lib/documents/catalog";
import { decryptDocument } from "@/lib/documents/crypto";
import { GOOGLE_CALENDAR_AAD } from "@/lib/google/oauth";
import {
  getGoogleCalendarSecrets,
  updateGoogleCalendarSecrets,
  upsertGoogleCalendarSecrets,
} from "@/lib/google/secrets";
import { MICROSOFT_CALENDAR_AAD } from "@/lib/microsoft/oauth";
import {
  getMicrosoftCalendarSecrets,
  updateMicrosoftCalendarSecrets,
  upsertMicrosoftCalendarSecrets,
} from "@/lib/microsoft/secrets";
import { hasAppEncryptionKey, requireAppEncryptionKey } from "@/lib/security/app-encryption-key";
import {
  decryptBookingGuestRow,
  decryptPersonRow,
  encryptAnswersValue,
  encryptBookingFormAnswers,
  PII_AAD,
} from "@/lib/security/client-pii";
import { hashEmailLookup, hashPortalEmail } from "@/lib/security/email-lookup";
import {
  decryptField,
  encryptField,
  isEncryptedField,
  isEncryptedJson,
} from "@/lib/security/field-crypto";
import { loadOrCreateOrgDataKey } from "@/lib/security/org-data-key";
import { SQUARE_AAD } from "@/lib/square/oauth";
import { MANAGE_TOKEN_AAD, PAYMENT_TOKEN_AAD } from "@/lib/square/payments";
import { getSquareSecrets, upsertSquareSecrets } from "@/lib/square/secrets";
import { createServiceClient } from "@/lib/supabase/admin";
import { ZOOM_AAD } from "@/lib/zoom/oauth";
import { getZoomSecrets, upsertZoomSecrets } from "@/lib/zoom/secrets";

const PAGE = 200;

export type SealClientPiiResult = {
  orgs: number;
  people: number;
  notes: number;
  projectNotes: number;
  projects: number;
  answers: number;
  documentFiles: number;
  documentBlobs: number;
  documentRequests: number;
  destructions: number;
  appointments: number;
  paymentTokens: number;
  squareSecrets: number;
  googleSecrets: number;
  microsoftSecrets: number;
  zoomSecrets: number;
  bookingSettings: number;
  shareLinks: number;
  bookingInvites: number;
};

const dekCache = new Map<string, Buffer>();

async function orgKey(orgId: string): Promise<Buffer> {
  const cached = dekCache.get(orgId);
  if (cached) return cached;
  const key = await loadOrCreateOrgDataKey(orgId);
  dekCache.set(orgId, key);
  return key;
}

function rekeyString(
  value: string | null | undefined,
  aad: string,
  key: Buffer,
): string | undefined {
  if (value == null || value === "") return undefined;
  if (!isEncryptedField(value)) {
    return encryptField(value, aad, key);
  }
  try {
    decryptField(value, aad, key);
    return undefined;
  } catch {
    throw new Error(`rekey_failed:${aad}`);
  }
}

async function forEachPage<T extends { id: string }>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  visit: (row: T) => Promise<boolean>,
): Promise<number> {
  let from = 0;
  let updated = 0;
  while (true) {
    const rows = await fetchPage(from, from + PAGE - 1);
    if (rows.length === 0) break;
    for (const row of rows) {
      if (await visit(row)) updated += 1;
    }
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return updated;
}

/**
 * Ensures each org has a wrapped DEK, then re-encrypts client fields with
 * that org key. Safe to re-run: org-keyed ciphertext is left unchanged.
 */
export async function sealAllClientPii(): Promise<SealClientPiiResult> {
  if (!hasAppEncryptionKey()) {
    throw new Error("missing_encryption_key");
  }

  const admin = createServiceClient();

  const { data: orgRows, error: orgError } = await admin
    .from("organizations")
    .select("id")
    .order("created_at", { ascending: true });
  if (orgError) throw new Error(`organizations: ${orgError.message}`);
  let orgs = 0;
  for (const org of orgRows ?? []) {
    await orgKey(org.id as string);
    orgs += 1;
  }

  const people = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("people")
        .select(
          "id, organization_id, first_name, last_name, email, phone, email_lookup_hash, portal_email_hash",
        )
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`people: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        phone: string | null;
        email_lookup_hash: string | null;
        portal_email_hash: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const first = rekeyString(row.first_name, PII_AAD.people.firstName, key);
      const last = rekeyString(row.last_name, PII_AAD.people.lastName, key);
      const email = rekeyString(row.email, PII_AAD.people.email, key);
      const phone = rekeyString(row.phone, PII_AAD.people.phone, key);
      if (first !== undefined) patch.first_name = first;
      if (last !== undefined) patch.last_name = last;
      if (email !== undefined) patch.email = email;
      if (phone !== undefined) patch.phone = phone;
      const person = decryptPersonRow(
        {
          first_name: first ?? row.first_name,
          last_name: last ?? row.last_name,
          email: email ?? row.email,
        },
        key,
      );
      const nextHash = person.email
        ? hashEmailLookup(row.organization_id, person.email, key)
        : null;
      if ((row.email_lookup_hash ?? null) !== nextHash) {
        patch.email_lookup_hash = nextHash;
      }
      const nextPortalHash =
        person.email && hasAppEncryptionKey()
          ? hashPortalEmail(person.email, requireAppEncryptionKey())
          : null;
      if ((row.portal_email_hash ?? null) !== nextPortalHash) {
        patch.portal_email_hash = nextPortalHash;
      }
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin.from("people").update(patch).eq("id", row.id);
      if (error) throw new Error(`people update: ${error.message}`);
      return true;
    },
  );

  const notes = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("person_notes")
        .select("id, organization_id, body")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`person_notes: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        body: string;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const body = rekeyString(row.body, PII_AAD.notes.body, key);
      if (body === undefined) return false;
      const { error } = await admin
        .from("person_notes")
        .update({ body })
        .eq("id", row.id);
      if (error) throw new Error(`person_notes update: ${error.message}`);
      return true;
    },
  );

  const projectNotes = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_notes")
        .select("id, organization_id, body")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_notes: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        body: string;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const body = rekeyString(row.body, PII_AAD.projectNotes.body, key);
      if (body === undefined) return false;
      const { error } = await admin
        .from("project_notes")
        .update({ body })
        .eq("id", row.id);
      if (error) throw new Error(`project_notes update: ${error.message}`);
      return true;
    },
  );

  const projects = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("immigration_projects")
        .select(
          "id, organization_id, title, description, notes, destruction_note",
        )
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`immigration_projects: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        title: string;
        description: string | null;
        notes: string | null;
        destruction_note: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const title = rekeyString(row.title, PII_AAD.projects.title, key);
      const description = rekeyString(
        row.description,
        PII_AAD.projects.description,
        key,
      );
      const notesValue = rekeyString(row.notes, PII_AAD.projects.notes, key);
      const destruction = rekeyString(
        row.destruction_note,
        PII_AAD.projects.destructionNote,
        key,
      );
      if (title !== undefined) patch.title = title;
      if (description !== undefined) patch.description = description;
      if (notesValue !== undefined) patch.notes = notesValue;
      if (destruction !== undefined) patch.destruction_note = destruction;
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin
        .from("immigration_projects")
        .update(patch)
        .eq("id", row.id);
      if (error) throw new Error(`immigration_projects update: ${error.message}`);
      return true;
    },
  );

  const answers = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_form_answers")
        .select("id, organization_id, answers")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_form_answers: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        answers: unknown;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      if (isEncryptedJson(row.answers)) {
        decryptField(row.answers.__mc_enc, PII_AAD.answers, key);
        return false;
      }
      const { error } = await admin
        .from("project_form_answers")
        .update({ answers: encryptAnswersValue(row.answers, key) })
        .eq("id", row.id);
      if (error) throw new Error(`project_form_answers update: ${error.message}`);
      return true;
    },
  );

  const documentFiles = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_document_files")
        .select("id, organization_id, original_filename")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_document_files: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        original_filename: string;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const name = rekeyString(
        row.original_filename,
        PII_AAD.documents.originalFilename,
        key,
      );
      if (name === undefined) return false;
      const { error } = await admin
        .from("project_document_files")
        .update({ original_filename: name })
        .eq("id", row.id);
      if (error) throw new Error(`project_document_files update: ${error.message}`);
      return true;
    },
  );

  const documentRequests = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_document_requests")
        .select("id, organization_id, custom_label, consultant_note")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_document_requests: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        custom_label: string | null;
        consultant_note: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const label = rekeyString(
        row.custom_label,
        PII_AAD.documents.customLabel,
        key,
      );
      const note = rekeyString(
        row.consultant_note,
        PII_AAD.documents.consultantNote,
        key,
      );
      if (label !== undefined) patch.custom_label = label;
      if (note !== undefined) patch.consultant_note = note;
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin
        .from("project_document_requests")
        .update(patch)
        .eq("id", row.id);
      if (error) throw new Error(`project_document_requests update: ${error.message}`);
      return true;
    },
  );

  const destructions = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("file_destruction_register")
        .select("id, organization_id, client_name, service_summary")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`file_destruction_register: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        client_name: string;
        service_summary: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, string | null> = {};
      const clientName = rekeyString(
        row.client_name,
        PII_AAD.destruction.clientName,
        key,
      );
      const summary = rekeyString(
        row.service_summary,
        PII_AAD.destruction.serviceSummary,
        key,
      );
      if (clientName !== undefined) patch.client_name = clientName;
      if (summary !== undefined) patch.service_summary = summary;
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin
        .from("file_destruction_register")
        .update(patch)
        .eq("id", row.id);
      if (error) throw new Error(`file_destruction_register update: ${error.message}`);
      return true;
    },
  );

  const documentBlobs = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_document_files")
        .select("id, organization_id, storage_path")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`document blobs: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        storage_path: string | null;
      }>;
    },
    async (row) => {
      if (!row.storage_path) return false;
      const key = await orgKey(row.organization_id);
      const { data, error } = await admin.storage
        .from(CLIENT_DOCUMENTS_BUCKET)
        .download(row.storage_path);
      if (error || !data) {
        throw new Error(
          `document download ${row.id}: ${error?.message ?? "missing"}`,
        );
      }
      const payload = Buffer.from(await data.arrayBuffer());
      decryptDocument(payload, key);
      return false;
    },
  );

  const appointments = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("booking_appointments")
        .select(
          "id, organization_id, guest_name, guest_email, guest_phone, guest_address, manage_token_encrypted, form_answers, email_lookup_hash",
        )
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`booking_appointments: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        guest_name: string;
        guest_email: string;
        guest_phone: string | null;
        guest_address: string | null;
        manage_token_encrypted: string | null;
        form_answers: unknown;
        email_lookup_hash: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const patch: Record<string, unknown> = {};
      const guestName = rekeyString(row.guest_name, PII_AAD.booking.guestName, key);
      const guestEmail = rekeyString(
        row.guest_email,
        PII_AAD.booking.guestEmail,
        key,
      );
      const guestPhone = rekeyString(
        row.guest_phone,
        PII_AAD.booking.guestPhone,
        key,
      );
      const guestAddress = rekeyString(
        row.guest_address,
        PII_AAD.booking.guestAddress,
        key,
      );
      const manageToken = rekeyString(
        row.manage_token_encrypted,
        MANAGE_TOKEN_AAD,
        key,
      );
      if (guestName !== undefined) patch.guest_name = guestName;
      if (guestEmail !== undefined) patch.guest_email = guestEmail;
      if (guestPhone !== undefined) patch.guest_phone = guestPhone;
      if (guestAddress !== undefined) patch.guest_address = guestAddress;
      if (manageToken !== undefined) patch.manage_token_encrypted = manageToken;
      if (isEncryptedJson(row.form_answers)) {
        decryptField(row.form_answers.__mc_enc, PII_AAD.booking.formAnswers, key);
      } else if (row.form_answers && typeof row.form_answers === "object") {
        patch.form_answers = encryptBookingFormAnswers(
          row.form_answers as Record<string, string>,
          key,
        );
      }
      const guest = decryptBookingGuestRow(
        {
          guest_name: (patch.guest_name as string | undefined) ?? row.guest_name,
          guest_email:
            (patch.guest_email as string | undefined) ?? row.guest_email,
        },
        key,
      );
      const nextHash = guest.guest_email
        ? hashEmailLookup(row.organization_id, guest.guest_email, key)
        : null;
      if ((row.email_lookup_hash ?? null) !== nextHash) {
        patch.email_lookup_hash = nextHash;
      }
      if (Object.keys(patch).length === 0) return false;
      const { error } = await admin
        .from("booking_appointments")
        .update(patch)
        .eq("id", row.id);
      if (error) throw new Error(`booking_appointments update: ${error.message}`);
      return true;
    },
  );

  const paymentTokens = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("payment_requests")
        .select("id, organization_id, token_encrypted")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`payment_requests: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        token_encrypted: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const next = rekeyString(row.token_encrypted, PAYMENT_TOKEN_AAD, key);
      if (next === undefined) return false;
      const { error } = await admin
        .from("payment_requests")
        .update({ token_encrypted: next })
        .eq("id", row.id);
      if (error) throw new Error(`payment token: ${error.message}`);
      return true;
    },
  );

  const { data: squareRows, error: squareError } = await admin
    .from("square_connections")
    .select("id, organization_id");
  if (squareError) throw new Error(`square_connections: ${squareError.message}`);
  let squareSecrets = 0;
  for (const row of squareRows ?? []) {
    const connectionId = row.id as string;
    const key = await orgKey(row.organization_id as string);
    const secrets = await getSquareSecrets(connectionId);
    if (!secrets) continue;
    const access = rekeyString(
      secrets.access_token_encrypted,
      SQUARE_AAD.accessToken,
      key,
    );
    const refresh = rekeyString(
      secrets.refresh_token_encrypted,
      SQUARE_AAD.refreshToken,
      key,
    );
    if (access === undefined && refresh === undefined) continue;
    await upsertSquareSecrets({
      connectionId,
      accessTokenEncrypted: access ?? secrets.access_token_encrypted,
      refreshTokenEncrypted: refresh ?? secrets.refresh_token_encrypted,
      accessTokenExpiresAt: secrets.access_token_expires_at
        ? new Date(secrets.access_token_expires_at)
        : null,
    });
    squareSecrets += 1;
  }

  const { data: googleRows, error: googleError } = await admin
    .from("google_calendar_connections")
    .select("id, organization_id");
  if (googleError) {
    throw new Error(`google_calendar_connections: ${googleError.message}`);
  }
  let googleSecrets = 0;
  for (const row of googleRows ?? []) {
    const connectionId = row.id as string;
    const key = await orgKey(row.organization_id as string);
    const secrets = await getGoogleCalendarSecrets(connectionId);
    if (!secrets) continue;
    const refresh = rekeyString(
      secrets.refresh_token_encrypted,
      GOOGLE_CALENDAR_AAD.refreshToken,
      key,
    );
    const access = rekeyString(
      secrets.access_token_encrypted,
      GOOGLE_CALENDAR_AAD.accessToken,
      key,
    );
    const channel = rekeyString(
      secrets.channel_token_encrypted,
      GOOGLE_CALENDAR_AAD.channelToken,
      key,
    );
    if (refresh === undefined && access === undefined && channel === undefined) {
      continue;
    }
    await upsertGoogleCalendarSecrets({
      connectionId,
      refreshTokenEncrypted: refresh ?? secrets.refresh_token_encrypted,
      accessTokenEncrypted: access ?? secrets.access_token_encrypted,
      accessTokenExpiresAt: secrets.access_token_expires_at
        ? new Date(secrets.access_token_expires_at)
        : null,
      syncToken: secrets.sync_token,
    });
    if (channel !== undefined) {
      await updateGoogleCalendarSecrets(connectionId, {
        channelTokenEncrypted: channel,
      });
    }
    googleSecrets += 1;
  }

  const { data: microsoftRows, error: microsoftError } = await admin
    .from("microsoft_calendar_connections")
    .select("id, organization_id");
  if (microsoftError) {
    throw new Error(
      `microsoft_calendar_connections: ${microsoftError.message}`,
    );
  }
  let microsoftSecrets = 0;
  for (const row of microsoftRows ?? []) {
    const connectionId = row.id as string;
    const key = await orgKey(row.organization_id as string);
    const secrets = await getMicrosoftCalendarSecrets(connectionId);
    if (!secrets) continue;
    const refresh = rekeyString(
      secrets.refresh_token_encrypted,
      MICROSOFT_CALENDAR_AAD.refreshToken,
      key,
    );
    const access = rekeyString(
      secrets.access_token_encrypted,
      MICROSOFT_CALENDAR_AAD.accessToken,
      key,
    );
    const channel = rekeyString(
      secrets.channel_token_encrypted,
      MICROSOFT_CALENDAR_AAD.channelToken,
      key,
    );
    if (refresh === undefined && access === undefined && channel === undefined) {
      continue;
    }
    await upsertMicrosoftCalendarSecrets({
      connectionId,
      refreshTokenEncrypted: refresh ?? secrets.refresh_token_encrypted,
      accessTokenEncrypted: access ?? secrets.access_token_encrypted,
      accessTokenExpiresAt: secrets.access_token_expires_at
        ? new Date(secrets.access_token_expires_at)
        : null,
      syncToken: secrets.sync_token,
    });
    if (channel !== undefined) {
      await updateMicrosoftCalendarSecrets(connectionId, {
        channelTokenEncrypted: channel,
      });
    }
    microsoftSecrets += 1;
  }

  const { data: zoomRows, error: zoomError } = await admin
    .from("zoom_connections")
    .select("id, organization_id");
  if (zoomError) {
    throw new Error(`zoom_connections: ${zoomError.message}`);
  }
  let zoomSecrets = 0;
  for (const row of zoomRows ?? []) {
    const connectionId = row.id as string;
    const key = await orgKey(row.organization_id as string);
    const secrets = await getZoomSecrets(connectionId);
    if (!secrets) continue;
    const refresh = rekeyString(
      secrets.refresh_token_encrypted,
      ZOOM_AAD.refreshToken,
      key,
    );
    const access = rekeyString(
      secrets.access_token_encrypted,
      ZOOM_AAD.accessToken,
      key,
    );
    if (refresh === undefined && access === undefined) continue;
    await upsertZoomSecrets({
      connectionId,
      refreshTokenEncrypted: refresh ?? secrets.refresh_token_encrypted,
      accessTokenEncrypted: access ?? secrets.access_token_encrypted,
      accessTokenExpiresAt: secrets.access_token_expires_at
        ? new Date(secrets.access_token_expires_at)
        : null,
    });
    zoomSecrets += 1;
  }

  const bookingSettings = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("booking_settings")
        .select("id, organization_id, public_token_encrypted")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`booking_settings: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        public_token_encrypted: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const next = rekeyString(
        row.public_token_encrypted,
        PII_AAD.booking.token,
        key,
      );
      if (next === undefined) return false;
      const { error } = await admin
        .from("booking_settings")
        .update({ public_token_encrypted: next })
        .eq("id", row.id);
      if (error) throw new Error(`booking_settings update: ${error.message}`);
      return true;
    },
  );

  const shareLinks = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("form_share_links")
        .select("id, organization_id, token_encrypted")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`form_share_links: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        token_encrypted: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const next = rekeyString(row.token_encrypted, PII_AAD.shareLinks.token, key);
      if (next === undefined) return false;
      const { error } = await admin
        .from("form_share_links")
        .update({ token_encrypted: next })
        .eq("id", row.id);
      if (error) throw new Error(`form_share_links update: ${error.message}`);
      return true;
    },
  );

  const bookingInvites = await forEachPage(
    async (from, to) => {
      const { data, error } = await admin
        .from("project_booking_invites")
        .select("id, organization_id, token_encrypted")
        .order("created_at", { ascending: true })
        .range(from, to);
      if (error) throw new Error(`project_booking_invites: ${error.message}`);
      return (data ?? []) as Array<{
        id: string;
        organization_id: string;
        token_encrypted: string | null;
      }>;
    },
    async (row) => {
      const key = await orgKey(row.organization_id);
      const next = rekeyString(
        row.token_encrypted,
        PII_AAD.bookingInvites.token,
        key,
      );
      if (next === undefined) return false;
      const { error } = await admin
        .from("project_booking_invites")
        .update({ token_encrypted: next })
        .eq("id", row.id);
      if (error) throw new Error(`booking invites update: ${error.message}`);
      return true;
    },
  );

  return {
    orgs,
    people,
    notes,
    projectNotes,
    projects,
    answers,
    documentFiles,
    documentBlobs,
    documentRequests,
    destructions,
    appointments,
    paymentTokens,
    squareSecrets,
    googleSecrets,
    microsoftSecrets,
    zoomSecrets,
    bookingSettings,
    shareLinks,
    bookingInvites,
  };
}
