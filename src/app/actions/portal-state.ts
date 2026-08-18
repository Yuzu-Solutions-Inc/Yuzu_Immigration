export type PortalOrgChoice = {
  personId: string;
  organizationId: string;
  label: string;
};

export type PortalAuthActionState = {
  error?: string;
  message?: string;
  personId?: string;
  organizationId?: string;
  organizationName?: string;
  organizations?: PortalOrgChoice[];
  googleLoginEnabled?: boolean;
  legalAccepted?: boolean;
};

export const portalAuthInitialState: PortalAuthActionState = {};

export type PortalStaffActionState = {
  error?: string;
  message?: string;
  portalUrl?: string;
};

export const portalStaffInitialState: PortalStaffActionState = {};

export type PortalProjectActionState = {
  error?: string;
  message?: string;
  portalUrl?: string;
  invited?: number;
  skippedNoEmail?: number;
};

export const portalProjectInitialState: PortalProjectActionState = {};
