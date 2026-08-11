import { createClient } from "@/lib/supabase/server";

export type OrgMembership = {
  id: string;
  role: "owner" | "admin" | "member";
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export async function getSessionUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) {
    return null;
  }
  return user;
}

export async function getUserMemberships(): Promise<OrgMembership[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select("id, role, organization_id")
    .eq("user_id", user.id);

  if (membershipError || !membershipRows?.length) {
    if (membershipError) {
      console.error("getUserMemberships members:", membershipError.message);
    }
    return [];
  }

  const orgIds = membershipRows.map((row) => row.organization_id as string);
  const { data: orgs, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug")
    .in("id", orgIds);

  if (orgError) {
    console.error("getUserMemberships orgs:", orgError.message);
    return [];
  }

  const orgById = new Map((orgs ?? []).map((org) => [org.id as string, org]));

  return membershipRows
    .map((row) => {
      const organization = orgById.get(row.organization_id as string);
      if (!organization) {
        return null;
      }

      return {
        id: row.id as string,
        role: row.role as OrgMembership["role"],
        organization: {
          id: organization.id as string,
          name: organization.name as string,
          slug: organization.slug as string,
        },
      };
    })
    .filter((row): row is OrgMembership => row !== null);
}

export async function getPrimaryMembership() {
  const memberships = await getUserMemberships();
  return memberships[0] ?? null;
}
