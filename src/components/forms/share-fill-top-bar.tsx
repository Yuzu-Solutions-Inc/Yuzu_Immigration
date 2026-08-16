import { BrandLogo } from "@/components/brand/brand-logo";
import { cn } from "@/lib/utils";

export function ShareFillTopBar({
  organizationName,
  representativeName,
  className,
}: {
  organizationName?: string;
  representativeName?: string;
  className?: string;
}) {
  const org = organizationName?.trim() ?? "";
  const rep = representativeName?.trim() ?? "";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex h-12 shrink-0 items-center gap-3 border-b border-sidebar-border bg-sidebar px-3 text-sidebar-foreground sm:px-4",
        className,
      )}
    >
      <BrandLogo href={null} size="sm" inverted className="shrink-0" />

      {org || rep ? (
        <div className="min-w-0 flex-1">
          {org ? (
            <p className="truncate text-sm font-semibold text-sidebar-foreground">
              {org}
            </p>
          ) : null}
          {rep ? (
            <p className="truncate text-xs text-sidebar-foreground/70">{rep}</p>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
