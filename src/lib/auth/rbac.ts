import type { OrgMembership } from "@/lib/auth/session";

export type OrgRole = OrgMembership["role"];

const WRITE_ROLES: OrgRole[] = ["owner", "admin", "member"];
const ADMIN_ROLES: OrgRole[] = ["owner", "admin"];
const OWNER_ROLES: OrgRole[] = ["owner"];

export function canWriteOrgData(role: OrgRole | null | undefined): boolean {
  return !!role && WRITE_ROLES.includes(role);
}

/** Org settings, retention destroy, member management. */
export function canAdministerOrg(role: OrgRole | null | undefined): boolean {
  return !!role && ADMIN_ROLES.includes(role);
}

export function canTransferOwnership(role: OrgRole | null | undefined): boolean {
  return !!role && OWNER_ROLES.includes(role);
}

export function assertCanAdministerOrg(role: OrgRole | null | undefined): void {
  if (!canAdministerOrg(role)) {
    throw new Error("forbidden_role");
  }
}
