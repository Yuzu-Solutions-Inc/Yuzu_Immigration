"use client";

import { ChevronDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { StatusPill, type StatusPillTone } from "@/components/ui/status-pill";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/i18n/navigation";
import type {
  AttentionAlert,
  AttentionKind,
  AttentionRow,
} from "@/lib/crm/dashboard";
import { formatPriceCents } from "@/lib/booking/slots";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<AttentionKind, StatusPillTone> = {
  overdue: "destructive",
  docs_review: "action",
  questionnaire: "action",
  unpaid: "action",
  stuck: "muted",
  due_soon: "muted",
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

function pillLabel(
  alert: AttentionAlert,
  t: ReturnType<typeof useTranslations<"appHome">>,
) {
  return t(`attention.kinds.${alert.kind}`);
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

  const visible = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((row) =>
      row.alerts.some((alert) => alert.kind === filter),
    );
  }, [filter, rows]);

  const filterLabel =
    filter === "all"
      ? t("attention.filterAll")
      : t(`attention.kinds.${filter}`);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2.5">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h2 className="font-heading text-sm font-semibold text-brand">
          {t("attention.title")}
        </h2>
        <div className="flex items-center gap-2">
          {presentKinds.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  buttonVariants({ variant: "outline", size: "xs" }),
                  "gap-1",
                )}
                aria-label={t("attention.filter")}
              >
                {filterLabel}
                <ChevronDown className="size-3.5 opacity-60" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                <DropdownMenuRadioGroup
                  value={filter}
                  onValueChange={(value) => setFilter(value as FilterValue)}
                >
                  <DropdownMenuRadioItem value="all">
                    {t("attention.filterAll")}
                  </DropdownMenuRadioItem>
                  {presentKinds.map((kind) => (
                    <DropdownMenuRadioItem key={kind} value={kind}>
                      {t(`attention.kinds.${kind}`)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Link
            href="/projects"
            className="shrink-0 text-xs font-medium text-action hover:underline"
          >
            {t("viewAllProjects")}
          </Link>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("attention.empty")}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("attention.filterEmpty")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((row) => {
              const meta = rowMeta(row, locale, t);
              return (
                <li key={row.id}>
                  <Link
                    href={row.href}
                    className="flex items-center justify-between gap-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-brand">
                        {row.title}
                      </p>
                      <span className="flex min-w-0 flex-wrap items-center gap-1">
                        {row.alerts.map((alert) => (
                          <StatusPill
                            key={alert.kind}
                            label={pillLabel(alert, t)}
                            tone={KIND_TONE[alert.kind]}
                            className="px-2 py-0 text-[10px]"
                          />
                        ))}
                      </span>
                    </div>
                    {meta ? (
                      <p
                        className={cn(
                          "shrink-0 text-right text-xs font-medium",
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
        )}
      </div>
    </div>
  );
}
