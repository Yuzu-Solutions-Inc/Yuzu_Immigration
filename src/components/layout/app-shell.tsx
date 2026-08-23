import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";

import { AppTopBar } from "@/components/layout/app-top-bar";
import {
  DesktopSidebar,
  MobileSidebarTrigger,
} from "@/components/layout/sidebar-nav";
import { type OrgSwitcherOption } from "@/components/layout/org-switcher";
import { TrialLockBanner } from "@/components/layout/trial-lock-banner";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { OrgAccessLevel } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils";

export async function DashboardShell({
  organizations,
  activeOrganizationId,
  canCreate = true,
  writable = true,
  role,
  children,
}: {
  locale: string;
  organizations: OrgSwitcherOption[];
  activeOrganizationId: string;
  canCreate?: boolean;
  writable?: boolean;
  role?: OrgAccessLevel;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const tHome = await getTranslations("appHome");
  const sidebarCollapsed =
    (await cookies()).get("sidebar-collapsed")?.value === "1";

  const mobileTrigger = (
    <MobileSidebarTrigger
      organizations={organizations}
      activeOrganizationId={activeOrganizationId}
      newProjectLabel={tHome("newProject")}
      newPersonLabel={tHome("newPerson")}
      canCreate={canCreate}
    />
  );

  return (
    <div className="flex h-dvh max-h-dvh min-h-0 overflow-hidden bg-canvas">
      <DesktopSidebar
        organizations={organizations}
        activeOrganizationId={activeOrganizationId}
        newProjectLabel={tHome("newProject")}
        newPersonLabel={tHome("newPerson")}
        canCreate={canCreate}
        defaultCollapsed={sidebarCollapsed}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AppTopBar mobileTrigger={mobileTrigger} />

        <main className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col overflow-y-auto px-3 py-4 sm:px-6 sm:py-6 lg:py-4">
          {!writable && role ? <TrialLockBanner role={role} /> : null}
          {children}
        </main>
      </div>
    </div>
  );
}

export function NewProjectButton({ label }: { label: string }) {
  return (
    <Link
      href="/projects/new"
      className={cn(
        buttonVariants({ size: "sm" }),
        "bg-action text-action-foreground hover:bg-action/90",
      )}
    >
      {label}
    </Link>
  );
}
