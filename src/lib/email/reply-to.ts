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

/** Host/consultant mailbox for public bookings that are not on an immigration file. */
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
