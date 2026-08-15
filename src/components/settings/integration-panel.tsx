import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function IntegrationPanel({
  logo,
  title,
  description,
  connected,
  statusConnectedLabel,
  statusDisconnectedLabel,
  headingLevel = 2,
  children,
  actions,
  className,
}: {
  logo: ReactNode;
  title: string;
  description: string;
  connected: boolean;
  statusConnectedLabel: string;
  statusDisconnectedLabel: string;
  headingLevel?: 2 | 3;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const HeadingTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface p-1 shadow-sm">
          {logo}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <HeadingTag
              className={cn(
                "font-heading font-semibold text-brand",
                headingLevel === 3 ? "text-base" : "text-lg",
              )}
            >
              {title}
            </HeadingTag>
            <Badge
              variant={connected ? "default" : "secondary"}
              className={cn(
                connected &&
                  "border-transparent bg-success-bg text-success-text",
              )}
            >
              {connected ? statusConnectedLabel : statusDisconnectedLabel}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {children}

      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </section>
  );
}

export function IntegrationAccountCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: string;
  secondary?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border bg-canvas px-4 py-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 truncate text-[15px] font-medium text-brand">
        {primary}
      </p>
      {secondary ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p>
      ) : null}
    </div>
  );
}
