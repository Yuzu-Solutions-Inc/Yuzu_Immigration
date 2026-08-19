"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type {
  AttentionAlert,
  AttentionKind,
  AttentionRow,
} from "@/lib/crm/dashboard";
import { formatPriceCents } from "@/lib/booking/slots";
import { cn } from "@/lib/utils";

const KIND_DOT: Record<AttentionKind, string> = {
  overdue: "bg-destructive",
  docs_review: "bg-action",
  questionnaire: "bg-action",
  unpaid: "bg-action",
  stuck: "bg-muted-foreground",
  due_soon: "bg-muted-foreground",
};

const FILTER_KINDS: AttentionKind[] = [
  "overdue",
  "docs_review",
  "questionnaire",
  "unpaid",
  "stuck",
  "due_soon",
];

type FilterValue = "all" | AttentionKind;

function timingLabel(
  days: number,
  t: ReturnType<typeof useTranslations<"appHome">>,
) {
  if (days < 0) return t("timing.overdue", { days: Math.abs(days) });
  if (days === 0) return t("timing.today");
  return t("timing.inDays", { days });
}

function rowMeta(
  row: AttentionRow,
  locale: string,
  t: ReturnType<typeof useTranslations<"appHome">>,
) {
  const due = row.alerts.find(
    (alert) => alert.kind === "overdue" || alert.kind === "due_soon",
  );
  if (due?.days != null) {
    return {
      text: timingLabel(due.days, t),
      className: due.days < 0 ? "text-destructive" : "text-muted-foreground",
    };
  }
  const unpaid = row.alerts.find(
    (alert) => alert.kind === "unpaid" && alert.amountCents != null,
  );
  if (unpaid?.amountCents != null) {
    return {
      text: formatPriceCents(unpaid.amountCents, locale, unpaid.currency ?? "CAD"),
      className: "text-brand",
    };
  }
  const docs = row.alerts.find((alert) => alert.kind === "docs_review");
  if (docs?.count != null) {
    return {
      text: t("attention.docsCount", { count: docs.count }),
      className: "text-brand",
    };
  }
  return null;
}

function secondaryDetail(
  alerts: AttentionAlert[],
  primaryKind: AttentionKind,
  t: ReturnType<typeof useTranslations<"appHome">>,
) {
  const others = alerts.filter((alert) => alert.kind !== primaryKind);
  if (others.length === 0) return null;
  return others
    .map((alert) => {
      if (alert.kind === "docs_review" && alert.count != null) {
        return t("attention.docsCount", { count: alert.count });
      }
      return t(`attention.kinds.${alert.kind}`);
    })
    .join(" · ");
}

export function AttentionList({
  rows,
  locale,
}: {
  rows: AttentionRow[];
  locale: string;
}) {
  const t = useTranslations("appHome");
  const [filter, setFilter] = useState<FilterValue>("all");

  const presentKinds = useMemo(
    () =>
      FILTER_KINDS.filter((kind) =>
        rows.some((row) => row.alerts.some((alert) => alert.kind === kind)),
      ),
    [rows],
  );

  const kindCounts = useMemo(() => {
    const counts = {} as Record<AttentionKind, number>;
    for (const kind of FILTER_KINDS) counts[kind] = 0;
    for (const row of rows) {
      const seen = new Set<AttentionKind>();
      for (const alert of row.alerts) {
        if (seen.has(alert.kind)) continue;
        seen.add(alert.kind);
        counts[alert.kind] += 1;
      }
    }
    return counts;
  }, [rows]);

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) =>
      row.alerts.some((alert) => alert.kind === filter),
    );
  }, [filter, rows]);

  const groups = useMemo(() => {
    if (filter !== "all") {
      return [{ kind: filter, rows: visible }];
    }
    const buckets = new Map<AttentionKind, AttentionRow[]>();
    for (const kind of FILTER_KINDS) buckets.set(kind, []);
    for (const row of visible) {
      const primary = row.alerts[0]?.kind ?? "due_soon";
      buckets.get(primary)?.push(row);
    }
    return FILTER_KINDS.map((kind) => ({
      kind,
      rows: buckets.get(kind) ?? [],
    })).filter((group) => group.rows.length > 0);
  }, [filter, visible]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 items-baseline justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-brand">
          {t("attention.title")}
          {rows.length > 0 ? (
            <span className="ml-1.5 text-xs font-medium text-muted-foreground tabular-nums">
              {rows.length}
            </span>
          ) : null}
        </h2>
        <Link
          href="/projects"
          className="shrink-0 text-xs font-medium text-action hover:underline"
        >
          {t("viewAllProjects")}
        </Link>
      </div>
      {presentKinds.length > 1 ? (
        <div
          role="toolbar"
          aria-label={t("attention.filter")}
          className="flex shrink-0 flex-wrap gap-1"
        >
          <FilterChip
            active={filter === "all"}
            label={t("attention.filterAll")}
            count={rows.length}
            onClick={() => setFilter("all")}
          />
          {presentKinds.map((kind) => (
            <FilterChip
              key={kind}
              active={filter === kind}
              label={t(`attention.kinds.${kind}`)}
              count={kindCounts[kind]}
              dotClass={KIND_DOT[kind]}
              onClick={() => setFilter(kind)}
            />
          ))}
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("attention.empty")}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("attention.filterEmpty")}
          </p>
        ) : (
          <div className="flex min-w-0 flex-col">
            {groups.map((group, index) => {
              const showHeader = filter === "all" && groups.length > 1;
              return (
                <section
                  key={group.kind}
                  className={cn("min-w-0", index > 0 && "mt-3")}
                >
                  {showHeader ? (
                    <h3 className="sticky top-0 z-10 border-b border-border/70 bg-surface pb-1 text-[11px] font-medium text-muted-foreground">
                      <span
                        className={cn(
                          "mr-1.5 inline-block size-1.5 rounded-full align-middle",
                          KIND_DOT[group.kind],
                        )}
                        aria-hidden
                      />
                      {t(`attention.kinds.${group.kind}`)}
                    </h3>
                  ) : null}
                  <ul className="min-w-0">
                    {group.rows.map((row) => {
                      const meta = rowMeta(row, locale, t);
                      const primary = row.alerts[0]?.kind ?? group.kind;
                      const detail = secondaryDetail(row.alerts, primary, t);
                      return (
                        <li key={row.id} className="min-w-0">
                          <Link
                            href={row.href}
                            className="flex min-w-0 items-start justify-between gap-3 py-2 transition-colors hover:bg-muted/40"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-brand">
                                {row.title}
                              </p>
                              {detail ? (
                                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                  {detail}
                                </p>
                              ) : null}
                            </div>
                            {meta ? (
                              <p
                                className={cn(
                                  "shrink-0 pt-0.5 text-xs tabular-nums",
                                  meta.className,
                                )}
                              >
                                {meta.text}
                              </p>
                            ) : null}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  count,
  dotClass,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  dotClass?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        buttonVariants({ variant: "ghost", size: "xs" }),
        "max-w-full gap-1",
        active
          ? "bg-action/10 text-action hover:bg-action/15 hover:text-action"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {dotClass ? (
        <span className={cn("size-1.5 rounded-full", dotClass)} aria-hidden />
      ) : null}
      <span>{label}</span>
      <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );
}
