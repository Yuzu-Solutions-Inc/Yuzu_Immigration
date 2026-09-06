"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { DeletePartnerButton } from "@/components/partners/delete-partner-button";
import { DeletePersonButton } from "@/components/people/delete-person-button";
import {
  ListTableCard,
  listFooterClassName,
  listMobileEmptyClassName,
  listMobileFiltersStackClassName,
  listMobileFiltersClassName,
  listMobileItemClassName,
  listTableCardViewportClassName,
  listTableEdgeEndClassName,
  listTableEdgeStartClassName,
  listTableEmptyCellClassName,
  listTableHeadClassName,
  listTableScrollClassName,
  listTableStickyHeaderClassName,
  listViewportStackClassName,
} from "@/components/layout/list-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Link, useRouter } from "@/i18n/navigation";
import { matchesSearch } from "@/lib/finance/filters";
import type { PartnerKind, PartnerListRow } from "@/lib/finance/types";
import { cn, shouldIgnoreRowClick } from "@/lib/utils";

function PartnerDeleteControl({
  locale,
  partner,
  className,
}: {
  locale: string;
  partner: PartnerListRow;
  className?: string;
}) {
  if (partner.person_id) {
    return (
      <DeletePersonButton
        locale={locale}
        personId={partner.person_id}
        fullName={partner.legal_name}
        className={className}
      />
    );
  }
  return (
    <DeletePartnerButton
      locale={locale}
      partnerId={partner.id}
      name={partner.legal_name}
      className={className}
    />
  );
}

type SortKey = "name" | "kind" | "email" | "city";
type SortDir = "asc" | "desc";

function SortButton({
  column,
  label,
  sortKey,
  sortDir,
  onToggle,
}: {
  column: SortKey;
  label: string;
  sortKey: SortKey;
  sortDir: SortDir;
  onToggle: (column: SortKey) => void;
}) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <button
      type="button"
      onClick={() => onToggle(column)}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-0.5 py-0.5 text-left font-medium transition-colors",
        "hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active ? "text-brand" : "text-foreground",
      )}
    >
      {label}
      <Icon className="size-3.5 shrink-0 opacity-70" aria-hidden />
    </button>
  );
}

export function PartnersList({
  locale,
  initial,
  immigrationOn,
  canDelete,
}: {
  locale: string;
  initial: PartnerListRow[];
  immigrationOn: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations("financeApp");
  const ti = useTranslations("immigrationStatus");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<PartnerKind | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const kindLabel = (kind: PartnerKind) =>
    kind === "customer"
      ? t("partners.kindCustomer")
      : kind === "provider"
        ? t("partners.kindProvider")
        : t("partners.kindBoth");

  const filtered = useMemo(() => {
    const rows = initial.filter((p) => {
      if (kindFilter !== "all" && p.kind !== kindFilter) return false;
      return matchesSearch(
        search,
        p.legal_name,
        p.contact_name,
        p.email,
        p.city,
        p.kind,
      );
    });
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.legal_name.localeCompare(b.legal_name);
      else if (sortKey === "kind") cmp = a.kind.localeCompare(b.kind);
      else if (sortKey === "email")
        cmp = (a.email ?? "").localeCompare(b.email ?? "");
      else cmp = (a.city ?? "").localeCompare(b.city ?? "");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [initial, search, kindFilter, sortKey, sortDir]);

  const filtersActive = Boolean(search.trim() || kindFilter !== "all");
  const colSpan = 4 + (immigrationOn ? 1 : 0) + (canDelete ? 1 : 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir("asc");
  }

  return (
    <div className={listViewportStackClassName}>
      <div className={listMobileFiltersStackClassName}>
        <div className={listMobileFiltersClassName}>
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("partners.searchName")}
            aria-label={t("partners.filterName")}
          />
          <NativeSelect
            value={kindFilter}
            onChange={(e) =>
              setKindFilter(e.target.value as PartnerKind | "all")
            }
            aria-label={t("partners.filterRole")}
          >
            <option value="all">{t("common.all")}</option>
            <option value="customer">{t("partners.kindCustomer")}</option>
            <option value="provider">{t("partners.kindProvider")}</option>
            <option value="both">{t("partners.kindBoth")}</option>
          </NativeSelect>
        </div>

        {filtered.length === 0 ? (
          <p className={listMobileEmptyClassName}>{t("partners.noneMatch")}</p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((partner) => (
              <li key={partner.id}>
                <div className={cn("flex items-start gap-2", listMobileItemClassName)}>
                  <Link href={`/partners/${partner.id}`} className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium text-brand">{partner.legal_name}</p>
                    <p className="text-sm text-brand/80">{kindLabel(partner.kind)}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {partner.email ?? t("common.dash")}
                    </p>
                    {immigrationOn ? (
                      <p className="text-sm text-muted-foreground">
                        {ti((partner.immigration_status as "none") || "none")}
                      </p>
                    ) : null}
                  </Link>
                  {canDelete ? (
                    <PartnerDeleteControl locale={locale} partner={partner} />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ListTableCard className={cn("hidden md:block", listTableCardViewportClassName)}>
        <div className={listTableScrollClassName} data-list-scroll="">
          <Table>
            <TableHeader className={listTableStickyHeaderClassName}>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className={cn(
                    "min-w-[12rem]",
                    listTableHeadClassName,
                    listTableEdgeStartClassName,
                  )}
                >
                  <div className="flex flex-col gap-1.5">
                    <SortButton
                      column="name"
                      label={t("partners.name")}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                    <Input
                      type="search"
                      density="dense"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("partners.searchName")}
                      aria-label={t("partners.filterName")}
                    />
                  </div>
                </TableHead>
                <TableHead className={cn("min-w-[10rem]", listTableHeadClassName)}>
                  <div className="flex flex-col gap-1.5">
                    <SortButton
                      column="kind"
                      label={t("partners.role")}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                    <NativeSelect
                      density="dense"
                      value={kindFilter}
                      onChange={(e) =>
                        setKindFilter(e.target.value as PartnerKind | "all")
                      }
                      aria-label={t("partners.filterRole")}
                    >
                      <option value="all">{t("common.all")}</option>
                      <option value="customer">{t("partners.kindCustomer")}</option>
                      <option value="provider">{t("partners.kindProvider")}</option>
                      <option value="both">{t("partners.kindBoth")}</option>
                    </NativeSelect>
                  </div>
                </TableHead>
                <TableHead className={cn("min-w-[12rem]", listTableHeadClassName)}>
                  <SortButton
                    column="email"
                    label={t("partners.email")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                </TableHead>
                {immigrationOn ? (
                  <TableHead className={cn("min-w-[10rem]", listTableHeadClassName)}>
                    {t("partners.immigrationStatus")}
                  </TableHead>
                ) : null}
                <TableHead className={cn("min-w-[8rem]", listTableHeadClassName)}>
                  <SortButton
                    column="city"
                    label={t("partners.city")}
                    sortKey={sortKey}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                </TableHead>
                {canDelete ? (
                  <TableHead
                    className={cn(
                      "w-12",
                      listTableHeadClassName,
                      listTableEdgeEndClassName,
                    )}
                  >
                    <span className="sr-only">{t("common.delete")}</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={colSpan} className={listTableEmptyCellClassName}>
                    {t("partners.noneMatch")}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((partner) => (
                  <TableRow
                    key={partner.id}
                    className="group cursor-pointer"
                    onClick={(event) => {
                      if (shouldIgnoreRowClick(event)) return;
                      router.push(`/partners/${partner.id}`);
                    }}
                  >
                    <TableCell
                      className={cn("whitespace-normal", listTableEdgeStartClassName)}
                    >
                      <Link
                        href={`/partners/${partner.id}`}
                        className="font-medium text-brand transition-colors hover:opacity-80"
                      >
                        {partner.legal_name}
                      </Link>
                    </TableCell>
                    <TableCell>{kindLabel(partner.kind)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {partner.email ?? t("common.dash")}
                    </TableCell>
                    {immigrationOn ? (
                      <TableCell className="text-muted-foreground">
                        {ti((partner.immigration_status as "none") || "none")}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-muted-foreground">
                      {partner.city ?? t("common.dash")}
                    </TableCell>
                    {canDelete ? (
                      <TableCell className={cn("text-right", listTableEdgeEndClassName)}>
                        <PartnerDeleteControl
                          locale={locale}
                          partner={partner}
                          className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                        />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </ListTableCard>

      <div className={listFooterClassName}>
        <p className="text-sm text-muted-foreground">
          {t("partners.showingCount", {
            shown: filtered.length,
            total: initial.length,
          })}
        </p>
        {filtersActive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setSearch("");
              setKindFilter("all");
            }}
          >
            {t("partners.clearFilters")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
