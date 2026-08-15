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
  compact = false,
  children,
  actions,
  className,
}: {
  logo: ReactNode;
  title: string;
  description?: string;
  connected: boolean;
  statusConnectedLabel: string;
  statusDisconnectedLabel: string;
  headingLevel?: 2 | 3;
  compact?: boolean;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  const HeadingTag = headingLevel === 3 ? "h3" : "h2";

  return (
    <section className={cn(compact ? "space-y-2.5" : "space-y-4", className)}>
      <div className="flex flex-wrap items-start gap-2.5">
        <div
          className={cn(
            "flex shrink-0 items-center justify-center rounded-xl border border-border bg-surface shadow-sm",
            compact ? "size-9 p-0.5" : "size-12 p-1",
          )}
        >
          {logo}
        </div>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <HeadingTag
              className={cn(
                "font-heading font-semibold text-brand",
                compact || headingLevel === 3 ? "text-sm" : "text-lg",
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
          {description ? (
            <p
              className={cn(
                "text-muted-foreground",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {description}
            </p>
          ) : null}
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
  className,
}: {
  label: string;
  primary: string;
  secondary?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-canvas px-3 py-2.5",
        className,
      )}
    >
      <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-medium text-brand">{primary}</p>
      {secondary ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{secondary}</p>
      ) : null}
    </div>
  );
}
