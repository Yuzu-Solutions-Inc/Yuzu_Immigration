export const ORG_ROLES = ["owner", "admin", "case_manager"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];
export type OrgAccessLevel = OrgRole | "unlicensed";

export const DEFAULT_ORG_ROLE: OrgRole = "case_manager";

/** Roles that can be invited or assigned. Owner is transferred, never invited. */
export const ASSIGNABLE_ORG_ROLES = ["admin", "case_manager"] as const;

export type AssignableOrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number];

export function isOrgRole(value: unknown): value is OrgRole {
  return (
    typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value)
  );
}

export function isAssignableOrgRole(
  value: unknown,
): value is AssignableOrgRole {
  return (
    typeof value === "string" &&
    (ASSIGNABLE_ORG_ROLES as readonly string[]).includes(value)
  );
}

export function isOwner(role: OrgAccessLevel | null | undefined): boolean {
  return role === "owner";
}

/** Owner has the same workspace privileges as admin. */
export function isAdmin(role: OrgAccessLevel | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Owner, admin, and case manager: full org caseload, can create records. */
export function canCreateRecords(
  role: OrgAccessLevel | null | undefined,
): boolean {
  return role === "owner" || role === "admin" || role === "case_manager";
}

/** Org settings, invites, retention destroy, audit log. */
export function canAdministerOrg(
  role: OrgAccessLevel | null | undefined,
): boolean {
  return isAdmin(role);
}

/** Admin-only: services, contracts, booking forms, and service email templates. */
export function canManageBookingCatalog(
  role: OrgAccessLevel | null | undefined,
): boolean {
  return isAdmin(role);
}

export function canDeleteRecord(input: {
  role: OrgAccessLevel | null | undefined;
  createdBy: string | null | undefined;
  actorUserId: string | null | undefined;
}): boolean {
  if (isAdmin(input.role)) return true;
  if (input.role === "case_manager" && input.createdBy && input.actorUserId) {
    return input.createdBy === input.actorUserId;
  }
  return false;
}

export function canTransferOwnership(
  role: OrgAccessLevel | null | undefined,
): boolean {
  return isOwner(role);
}

export function canDeleteOrganization(
  role: OrgAccessLevel | null | undefined,
): boolean {
  return isOwner(role);
}

export function assertCanAdministerOrg(
  role: OrgAccessLevel | null | undefined,
): void {
  if (!canAdministerOrg(role)) {
    throw new Error("forbidden_role");
  }
}
