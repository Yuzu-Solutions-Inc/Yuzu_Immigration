import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

export function inboundMailDomain() {
  const domain = process.env.INBOUND_MAIL_DOMAIN?.trim().toLowerCase();
  return domain || null;
}

export function inboundAddressForLocalPart(localPart: string) {
  const domain = inboundMailDomain();
  if (!domain || !localPart) return null;
  return `${localPart}@${domain}`;
}

export function parseEmailAddress(raw: string) {
  const trimmed = raw.trim();
  const angle = trimmed.match(/<([^>]+)>/);
  return (angle?.[1] ?? trimmed).trim().toLowerCase();
}

export function emailLocalPart(email: string) {
  const normalized = parseEmailAddress(email);
  const at = normalized.lastIndexOf("@");
  if (at < 1) return "";
  return normalized.slice(0, at);
}

export function emailDomain(email: string) {
  const normalized = parseEmailAddress(email);
  const at = normalized.lastIndexOf("@");
  if (at < 1 || at === normalized.length - 1) return "";
  return normalized.slice(at + 1);
}

export function isInboundDomainAddress(email: string) {
  const domain = inboundMailDomain();
  if (!domain) return false;
  return emailDomain(email) === domain;
}

export async function projectInboundAddress(projectId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("immigration_projects")
    .select("inbound_local_part")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.error("projectInboundAddress:", error.message);
    return null;
  }
  const local = (data?.inbound_local_part as string | undefined)?.trim();
  if (!local) return null;
  return inboundAddressForLocalPart(local);
}

export async function organizationInboundAddress(organizationId: string) {
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("organizations")
    .select("inbound_local_part")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) {
    console.error("organizationInboundAddress:", error.message);
    return null;
  }
  const local = (data?.inbound_local_part as string | undefined)?.trim();
  if (!local) return null;
  return inboundAddressForLocalPart(local);
}
