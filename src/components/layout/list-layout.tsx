import type { ReactNode } from "react";

import { SurfaceCard } from "@/components/layout/surface-card";
import { cn } from "@/lib/utils";

export const listStackClassName = "min-w-0 space-y-3";

export const listMobileFiltersClassName =
  "grid gap-2 rounded-xl border border-border bg-surface p-3 shadow-elevated md:hidden";

export const listMobileFiltersStackClassName = "space-y-3 md:hidden";

export const listMobileItemClassName =
  "rounded-xl border border-border bg-surface p-3 shadow-elevated";

export const listMobileEmptyClassName =
  "rounded-xl border border-border bg-surface px-4 py-8 text-center text-[15px] text-muted-foreground";

export const listTableHeadClassName = "h-auto py-2.5 align-bottom";

export const listTableEdgeStartClassName = "pl-4";

export const listTableEdgeEndClassName = "pr-4";

export const listTableEmptyCellClassName =
  "px-4 py-8 text-center whitespace-normal text-[15px] text-muted-foreground";

export function ListTableCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <SurfaceCard className={cn("min-w-0 overflow-hidden p-0", className)}>
      {children}
    </SurfaceCard>
  );
}
