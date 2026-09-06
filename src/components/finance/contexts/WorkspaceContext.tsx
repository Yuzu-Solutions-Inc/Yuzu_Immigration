"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { OrgAccessLevel } from "@/lib/auth/rbac";

type WorkspaceValue = {
  organizationId: string;
  role: OrgAccessLevel;
  memberships: { organization_id: string; role: OrgAccessLevel }[];
  switchOrganization: (id: string) => void;
  reload: () => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({
  organizationId,
  role,
  children,
}: {
  organizationId: string;
  role: OrgAccessLevel;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider
      value={{
        organizationId,
        role,
        memberships: [{ organization_id: organizationId, role }],
        switchOrganization: () => undefined,
        reload: () => undefined,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}

export function useWorkspaceOptional() {
  return useContext(WorkspaceContext);
}
