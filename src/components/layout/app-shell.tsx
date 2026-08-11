import { getTranslations } from "next-intl/server";

import { signOutAction } from "@/app/actions/auth";
import {
  DesktopSidebar,
  MobileSidebarTrigger,
} from "@/components/layout/sidebar-nav";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export async function DashboardShell({
  locale,
  orgName,
  children,
  actions,
}: {
  locale: string;
  orgName: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  const auth = await getTranslations("auth");
  const tHome = await getTranslations("appHome");

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] flex-1 bg-canvas">
      <DesktopSidebar orgName={orgName} newProjectLabel={tHome("newProject")} />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur supports-backdrop-filter:bg-surface/80 sm:px-6">
          <div className="flex items-center gap-3">
            <MobileSidebarTrigger
              orgName={orgName}
              newProjectLabel={tHome("newProject")}
            />
            <p className="hidden text-sm text-muted-foreground sm:block lg:hidden">
              {orgName}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {actions}
            <Link
              href="/projects/new"
              className={cn(
                buttonVariants({ size: "sm" }),
                "hidden bg-action text-white hover:bg-action/90 sm:inline-flex lg:hidden",
              )}
            >
              {tHome("newProject")}
            </Link>
            <form action={signOutAction}>
              <input type="hidden" name="locale" value={locale} />
              <button
                type="submit"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
              >
                {auth("signOut")}
              </button>
            </form>
          </div>
        </header>

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
