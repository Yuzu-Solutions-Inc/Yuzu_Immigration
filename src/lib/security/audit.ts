import { headers } from "next/headers";

import { createServiceClient } from "@/lib/supabase/admin";

export type AuditActorKind =
  | "staff"
  | "share_link"
  | "public_booking"
  | "system"
  | "service";

export type AuditEventInput = {
  organizationId?: string | null;
  actorUserId?: string | null;
  actorKind: AuditActorKind;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Append-only security audit event. Never throws to callers — logging must
 * not break primary flows. Uses service_role (no client inserts).
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null;
    const userAgent = h.get("user-agent");

    const admin = createServiceClient();
    const { error } = await admin.from("security_audit_events").insert({
      organization_id: input.organizationId ?? null,
      actor_user_id: input.actorUserId ?? null,
      actor_kind: input.actorKind,
      action: input.action,
      resource_type: input.resourceType ?? null,
      resource_id: input.resourceId ?? null,
      metadata: input.metadata ?? {},
      ip,
      user_agent: userAgent,
    });

    if (error) {
      console.error("recordAuditEvent:", error.message);
    }
  } catch (err) {
    console.error("recordAuditEvent unexpected:", err);
  }
}
