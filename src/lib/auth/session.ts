import { createClient } from "@/lib/supabase/server";
import { getActiveOrganizationId } from "@/lib/auth/active-org";
import { orgAllowsWrites, trialEndsAt } from "@/lib/billing/trial";
import type { OrgAccessLevel, OrgRole } from "@/lib/auth/rbac";
import { DEFAULT_ORG_ROLE, isOrgRole } from "@/lib/auth/rbac";
import { toAppLocale, type AppLocale } from "@/lib/i18n/locales";
import { FALLBACK_MODULES, isModuleId, type ModuleId } from "@/lib/modules/catalog";

export type OrgMembership = {
  id: string;
  /** Effective access level. Unlicensed memberships are always read-only. */
  role: OrgAccessLevel;
  assignedRole: OrgRole;
  isLicensed: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
    defaultLocale: AppLocale;
    writable: boolean;
    subscribed: boolean;
    trialEndsAt: Date;
  };
  enabledModules: ModuleId[];
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
    .select("id, role, is_licensed, organization_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (membershipError || !membershipRows?.length) {
    if (membershipError) {
      console.error("getUserMemberships members:", membershipError.message);
    }
    return [];
  }

  const orgIds = membershipRows.map((row) => row.organization_id as string);
  const { data: orgs, error: orgError } = await supabase
    .from("organizations")
    .select("id, name, slug, default_locale, created_at, trial_started_at, subscribed_at, deleted_at")
    .in("id", orgIds)
    .is("deleted_at", null);

  if (orgError) {
    console.error("getUserMemberships orgs:", orgError.message);
    return [];
  }

  const orgById = new Map((orgs ?? []).map((org) => [org.id as string, org]));

  const modulesByOrg = new Map<string, ModuleId[]>();
  const { data: moduleRows, error: moduleError } = await supabase
    .from("organization_modules")
    .select("organization_id, module_id")
    .in("organization_id", orgIds);

  const modulesTableReady = !moduleError;
  if (moduleError) {
    if (
      moduleError.code !== "42P01" &&
      !moduleError.message.includes("organization_modules")
    ) {
      console.error("getUserMemberships modules:", moduleError.message);
    }
  } else {
    for (const row of moduleRows ?? []) {
      const orgId = row.organization_id as string;
      const moduleId = row.module_id;
      if (!isModuleId(moduleId)) continue;
      const list = modulesByOrg.get(orgId) ?? [];
      list.push(moduleId);
      modulesByOrg.set(orgId, list);
    }
  }

  return membershipRows
    .map((row) => {
      const organization = orgById.get(row.organization_id as string);
      if (!organization) {
        return null;
      }

      const assignedRole = isOrgRole(row.role) ? row.role : DEFAULT_ORG_ROLE;
      const isLicensed = row.is_licensed !== false;
      return {
        id: row.id as string,
        role: isLicensed ? assignedRole : "unlicensed",
        assignedRole,
        isLicensed,
        organization: {
          id: organization.id as string,
          name: organization.name as string,
          slug: organization.slug as string,
          defaultLocale: toAppLocale(organization.default_locale as string | null),
          writable: orgAllowsWrites({
            trialStartedAt: (organization.trial_started_at ??
              organization.created_at) as string,
            subscribedAt: organization.subscribed_at as string | null,
          }),
          subscribed: Boolean(organization.subscribed_at),
          trialEndsAt: trialEndsAt(
            (organization.trial_started_at ?? organization.created_at) as string,
          ),
        },
        enabledModules: modulesTableReady
          ? (modulesByOrg.get(organization.id as string) ?? [])
          : [...FALLBACK_MODULES],
      };
    })
    .filter((row): row is OrgMembership => row !== null);
}

export async function getWorkspaceContext(): Promise<{
  membership: OrgMembership | null;
  memberships: OrgMembership[];
}> {
  const memberships = await getUserMemberships();
  if (memberships.length === 0) {
    return { membership: null, memberships };
  }

  const activeId = await getActiveOrganizationId();
  const membership =
    memberships.find((row) => row.organization.id === activeId) ??
    memberships[0];

  return { membership, memberships };
}

export async function getPrimaryMembership() {
  const { membership } = await getWorkspaceContext();
  return membership;
}
