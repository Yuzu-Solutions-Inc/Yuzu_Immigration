import "server-only";

import { createServiceClient } from "@/lib/supabase/admin";

export type StaffReplyTo = {
  userId: string;
  email: string;
  name: string;
};

function looksLikeEmail(value: string) {
  const at = value.lastIndexOf("@");
  return at > 0 && at < value.length - 1 && !value.includes(" ");
}

function displayName(row: {
  full_name?: string | null;
  rep_given_name?: string | null;
  rep_family_name?: string | null;
  email?: string | null;
  rep_email?: string | null;
}) {
  const rep = [row.rep_given_name, row.rep_family_name]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" ");
  if (rep) return rep;
  const full = row.full_name?.trim();
  if (full) return full;
  const email = (row.rep_email || row.email || "").trim();
  return email.slice(0, email.indexOf("@")) || "Consultant";
}

export async function staffReplyTo(
  userId: string | null | undefined,
): Promise<StaffReplyTo | null> {
  if (!userId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, email, full_name, rep_email, rep_given_name, rep_family_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.error("staffReplyTo:", error.message);
    return null;
  }
  if (!data) return null;
  const email = ((data.rep_email as string | null) || (data.email as string | null) || "")
    .trim()
    .toLowerCase();
  if (!looksLikeEmail(email)) return null;
  return {
    userId: data.id as string,
    email,
    name: displayName(data),
  };
}

export async function projectRepresentativeUserId(
  projectId: string | null | undefined,
): Promise<string | null> {
  if (!projectId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("immigration_projects")
    .select("representative_user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.error("projectRepresentativeUserId:", error.message);
    return null;
  }
  return (data?.representative_user_id as string | null) ?? null;
}

/** Assigned representative when every active file for this person shares one. */
export async function personRepresentativeUserId(
  personId: string | null | undefined,
): Promise<string | null> {
  if (!personId) return null;
  const admin = createServiceClient();
  const { data, error } = await admin
    .from("project_participants")
    .select("immigration_projects!inner(representative_user_id, closed_at, destroyed_at)")
    .eq("person_id", personId)
    .is("left_at", null);
  if (error) {
    console.error("personRepresentativeUserId:", error.message);
    return null;
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const project = row.immigration_projects as
      | {
          representative_user_id?: string | null;
          closed_at?: string | null;
          destroyed_at?: string | null;
        }
      | {
          representative_user_id?: string | null;
          closed_at?: string | null;
          destroyed_at?: string | null;
        }[]
      | null;
    const projects = Array.isArray(project) ? project : project ? [project] : [];
    for (const item of projects) {
      if (item.closed_at || item.destroyed_at) continue;
      const id = item.representative_user_id?.trim();
      if (id) ids.add(id);
    }
  }
  if (ids.size !== 1) return null;
  return [...ids][0] ?? null;
}

export function uniqueReplyToUserId(
  userIds: Array<string | null | undefined>,
): string | null {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
  return ids.length === 1 ? ids[0]! : null;
}
