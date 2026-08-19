import type { ReactNode } from "react";

import { SurfaceCard } from "@/components/layout/surface-card";
import { fieldControlClassName } from "@/lib/field-styles";
import { cn } from "@/lib/utils";

export const listFilterControlClassName = fieldControlClassName({
  density: "dense",
});

export const listStackClassName = "min-w-0 space-y-3";

/** Fill the dashboard main pane. Phone lists still grow and scroll the main column. */
export const listPageClassName =
  "flex min-h-0 flex-col gap-3 lg:h-full lg:overflow-hidden";

/** Calendar (and similar) must fill the pane on every breakpoint so inner boards can scroll. */
export const fillPageClassName =
  "flex min-h-0 flex-1 flex-col overflow-hidden";

export const listPageHeaderClassName =
  "min-w-0 shrink-0 space-y-0.5 sm:space-y-1";

export const listPageTitleClassName =
  "font-heading text-2xl font-semibold text-brand lg:text-xl";

export const listPageSubtitleClassName =
  "hidden text-[15px] text-muted-foreground sm:block lg:text-sm";

export const listViewportStackClassName =
  "min-w-0 space-y-3 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-3 lg:space-y-0";

export const listTableCardViewportClassName =
  "min-h-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden";

export const listTableScrollClassName =
  "lg:min-h-0 lg:flex-1 lg:overflow-auto [&_[data-slot=table-container]]:overflow-visible";

export const listTableStickyHeaderClassName = "sticky top-0 z-10 bg-surface";

export const listFooterClassName =
  "flex shrink-0 flex-wrap items-center justify-between gap-2";

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
