import { getTranslations } from "next-intl/server";

import {
  DesktopSidebar,
  MobileSidebarTrigger,
} from "@/components/layout/sidebar-nav";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export async function DashboardShell({
  orgName,
  children,
}: {
  locale: string;
  orgName: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const tHome = await getTranslations("appHome");

  return (
    <div className="flex min-h-screen flex-1 bg-canvas">
      <DesktopSidebar orgName={orgName} newProjectLabel={tHome("newProject")} />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur supports-backdrop-filter:bg-surface/80 lg:hidden">
          <MobileSidebarTrigger
            orgName={orgName}
            newProjectLabel={tHome("newProject")}
          />
          <p className="truncate text-sm font-medium text-brand">{orgName}</p>
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
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
        "bg-action text-white hover:bg-action/90",
      )}
    >
      {label}
    </Link>
  );
}
