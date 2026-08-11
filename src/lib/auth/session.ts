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

  const { data, error } = await supabase
    .from("organization_members")
    .select(
      `
      id,
      role,
      organization:organizations (
        id,
        name,
        slug
      )
    `,
    )
    .eq("user_id", user.id);

  if (error || !data) {
    return [];
  }

  return data
    .map((row) => {
      const organization = Array.isArray(row.organization)
        ? row.organization[0]
        : row.organization;

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
