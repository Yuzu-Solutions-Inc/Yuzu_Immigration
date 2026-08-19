export const ORG_ROLES = ["admin", "case_manager"] as const;

export type OrgRole = (typeof ORG_ROLES)[number];

export const DEFAULT_ORG_ROLE: OrgRole = "case_manager";

export function isOrgRole(value: unknown): value is OrgRole {
  return (
    typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value)
  );
}

export function isAdmin(role: OrgRole | null | undefined): boolean {
  return role === "admin";
}

/** Admin and case manager: full org caseload, can create records. */
export function canCreateRecords(role: OrgRole | null | undefined): boolean {
  return role === "admin" || role === "case_manager";
}

/** Org settings, invites, retention destroy, audit log. */
export function canAdministerOrg(role: OrgRole | null | undefined): boolean {
  return isAdmin(role);
}

export function canDeleteRecord(input: {
  role: OrgRole | null | undefined;
  createdBy: string | null | undefined;
  actorUserId: string | null | undefined;
}): boolean {
  if (isAdmin(input.role)) return true;
  if (input.role === "case_manager" && input.createdBy && input.actorUserId) {
    return input.createdBy === input.actorUserId;
  }
  return false;
}

/** @deprecated use canAdministerOrg */
export function canTransferOwnership(role: OrgRole | null | undefined): boolean {
  return isAdmin(role);
}

export function assertCanAdministerOrg(role: OrgRole | null | undefined): void {
  if (!canAdministerOrg(role)) {
    throw new Error("forbidden_role");
  }
}
