export type PortalAuthActionState = {
  error?: string;
  message?: string;
};

export const portalAuthInitialState: PortalAuthActionState = {};

export type PortalStaffActionState = {
  error?: string;
  message?: string;
  accessCode?: string;
  portalUrl?: string;
};

export const portalStaffInitialState: PortalStaffActionState = {};
