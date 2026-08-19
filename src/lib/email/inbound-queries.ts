import "server-only";

import { requireOrganizationId } from "@/lib/crm/queries";
import {
  decryptInboundFilename,
  decryptInboundMessageRow,
} from "@/lib/security/client-pii";
import { getOrgDataKey } from "@/lib/security/org-data-key";
import { createClient } from "@/lib/supabase/server";

export type InboundAttachmentView = {
  id: string;
  filename: string;
  content_type: string;
  byte_size: number;
  skipped: boolean;
  skip_reason: string | null;
  filed_request_id: string | null;
  downloadable: boolean;
};

export type InboundMessageView = {
  id: string;
  organization_id: string;
  project_id: string | null;
  person_id: string | null;
  assignment_status: "project" | "person" | "unassigned";
  direction: "inbound" | "outbound";
  unknown_sender: boolean;
  from_email: string;
  to_address: string;
  subject: string;
  body_text: string;
  rfc_message_id: string | null;
  received_at: string;
  attachments: InboundAttachmentView[];
};

async function loadAttachments(
  organizationId: string,
  messageIds: string[],
  key: Buffer,
): Promise<Map<string, InboundAttachmentView[]>> {
  const map = new Map<string, InboundAttachmentView[]>();
  if (messageIds.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_attachments")
    .select(
      "id, message_id, filename, content_type, byte_size, skipped, skip_reason, filed_request_id, storage_path",
    )
    .eq("organization_id", organizationId)
    .in("message_id", messageIds);
  if (error) {
    console.error("list inbound attachments:", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const messageId = row.message_id as string;
    const list = map.get(messageId) ?? [];
    list.push({
      id: row.id as string,
      filename: decryptInboundFilename(row.filename as string, key),
      content_type: row.content_type as string,
      byte_size: row.byte_size as number,
      skipped: Boolean(row.skipped),
      skip_reason: (row.skip_reason as string | null) ?? null,
      filed_request_id: (row.filed_request_id as string | null) ?? null,
      downloadable: Boolean(row.storage_path) && !row.skipped,
    });
    map.set(messageId, list);
  }
  return map;
}

async function mapMessages(
  organizationId: string,
  rows: Record<string, unknown>[],
): Promise<InboundMessageView[]> {
  const key = await getOrgDataKey(organizationId);
  const attachments = await loadAttachments(
    organizationId,
    rows.map((row) => row.id as string),
    key,
  );
  return rows.map((row) => {
    const decrypted = decryptInboundMessageRow(
      {
        from_email: row.from_email as string,
        subject: row.subject as string,
        body_text: row.body_text as string,
      },
      key,
    );
    return {
      id: row.id as string,
      organization_id: organizationId,
      project_id: (row.project_id as string | null) ?? null,
      person_id: (row.person_id as string | null) ?? null,
      assignment_status: row.assignment_status as InboundMessageView["assignment_status"],
      direction: row.direction as InboundMessageView["direction"],
      unknown_sender: Boolean(row.unknown_sender),
      from_email: decrypted.from_email ?? "",
      to_address: row.to_address as string,
      subject: decrypted.subject ?? "",
      body_text: decrypted.body_text ?? "",
      rfc_message_id: (row.rfc_message_id as string | null) ?? null,
      received_at: row.received_at as string,
      attachments: attachments.get(row.id as string) ?? [],
    };
  });
}

const MESSAGE_SELECT =
  "id, organization_id, project_id, person_id, assignment_status, direction, unknown_sender, from_email, to_address, subject, body_text, rfc_message_id, received_at";

export async function listProjectInboundMessages(
  projectId: string,
): Promise<InboundMessageView[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_messages")
    .select(MESSAGE_SELECT)
    .eq("organization_id", orgId)
    .eq("project_id", projectId)
    .order("received_at", { ascending: true });
  if (error) {
    console.error("listProjectInboundMessages:", error.message);
    return [];
  }
  return mapMessages(orgId, (data ?? []) as Record<string, unknown>[]);
}

export async function listPersonInboundMessages(
  personId: string,
): Promise<InboundMessageView[]> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_messages")
    .select(MESSAGE_SELECT)
    .eq("organization_id", orgId)
    .eq("person_id", personId)
    .order("received_at", { ascending: true });
  if (error) {
    console.error("listPersonInboundMessages:", error.message);
    return [];
  }
  return mapMessages(orgId, (data ?? []) as Record<string, unknown>[]);
}

export async function listUnassignedInboundMessages(): Promise<
  InboundMessageView[]
> {
  const orgId = await requireOrganizationId();
  if (!orgId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inbound_messages")
    .select(MESSAGE_SELECT)
    .eq("organization_id", orgId)
    .eq("assignment_status", "unassigned")
    .order("received_at", { ascending: false });
  if (error) {
    console.error("listUnassignedInboundMessages:", error.message);
    return [];
  }
  return mapMessages(orgId, (data ?? []) as Record<string, unknown>[]);
}

export async function countUnassignedInboundMessages(): Promise<number> {
  const orgId = await requireOrganizationId();
  if (!orgId) return 0;
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("inbound_messages")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("assignment_status", "unassigned");
  if (error) {
    console.error("countUnassignedInboundMessages:", error.message);
    return 0;
  }
  return count ?? 0;
}
