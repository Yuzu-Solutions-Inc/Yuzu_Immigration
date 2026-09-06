import { redirect } from "next/navigation";

import { getWorkspaceContext } from "@/lib/auth/session";
import type { ModuleId } from "@/lib/modules/catalog";
import { isModuleEnabled } from "@/lib/modules/org-modules";

export async function requireModule(locale: string, moduleId: ModuleId) {
  const { membership } = await getWorkspaceContext();
  if (!membership) {
    redirect(`/${locale}/onboarding`);
  }
  if (!isModuleEnabled(membership.enabledModules, moduleId)) {
    redirect(`/${locale}/home`);
  }
  return membership;
}
