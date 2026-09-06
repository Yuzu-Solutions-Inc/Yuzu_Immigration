"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { loadPeoplePageAction } from "@/app/actions/list-pages";
import { DeletePersonButton } from "@/components/people/delete-person-button";
import { ListLoadMore } from "@/components/layout/list-load-more";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePagedList } from "@/hooks/use-paged-list";
import type { PersonImmigrationStatus } from "@/db/schema";
import { Link, useRouter } from "@/i18n/navigation";
import { daysUntilIso, formatDisplayDate } from "@/lib/crm/dates";
import { PERSON_IMMIGRATION_STATUSES } from "@/lib/crm/person-status";
import type { PeopleExpiryFilter, PeopleListSortKey, PersonRow } from "@/lib/crm/queries";
import type { ListPage } from "@/lib/lists/pagination";
import { cn, shouldIgnoreRowClick } from "@/lib/utils";

type SortKey = PeopleListSortKey;
type SortDir = "asc" | "desc";
type ExpiryFilter = PeopleExpiryFilter;

function expiryClass(isoDate: string | null) {
  if (!isoDate) return "text-muted-foreground";
  const days = daysUntilIso(isoDate);
  if (days < 0) return "text-destructive";
  if (days <= 7) return "text-warning-text";
  return "text-muted-foreground";
}

function PeopleSortButton({
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

export function PeopleList({
  locale,
  initial,
}: {
  locale: string;
  initial: ListPage<PersonRow>;
}) {
  const t = useTranslations("people");
  const ti = useTranslations("immigrationStatus");
  const router = useRouter();
  const [nameQuery, setNameQuery] = useState("");
  const [emailQuery, setEmailQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    PersonImmigrationStatus | "all"
  >("all");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const debouncedName = useDebouncedValue(nameQuery);
  const debouncedEmail = useDebouncedValue(emailQuery);
  const filters = useMemo(
    () => ({
      nameQuery: debouncedName,
      emailQuery: debouncedEmail,
      status: statusFilter,
      expiry: expiryFilter,
      sortKey,
      sortDir,
    }),
    [debouncedName, debouncedEmail, statusFilter, expiryFilter, sortKey, sortDir],
  );
  const fetchPage = useCallback(
    (offset: number) => loadPeoplePageAction({ ...filters, offset }),
    [filters],
  );
  const { items, total, loading, loadingMore, hasMore, loadMore } = usePagedList({
    initial,
    depsKey: JSON.stringify(filters),
    fetchPage,
  });
  const filteredSorted = items;

  const filtersActive = Boolean(
    nameQuery.trim() ||
      emailQuery.trim() ||
      statusFilter !== "all" ||
      expiryFilter !== "all",
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(
      key === "name" || key === "email" || key === "immigration_status"
        ? "asc"
        : "desc",
    );
  }

  return (
    <div
      className={listViewportStackClassName}
      aria-busy={loading || loadingMore}
    >
      <div className={listMobileFiltersStackClassName}>
        <div className={listMobileFiltersClassName}>
          <Input
            type="search"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder={t("filterNamePlaceholder")}
            aria-label={t("filterName")}
          />
          <Input
            type="search"
            value={emailQuery}
            onChange={(e) => setEmailQuery(e.target.value)}
            placeholder={t("filterEmailPlaceholder")}
            aria-label={t("filterEmail")}
          />
          <NativeSelect
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value as PersonImmigrationStatus | "all",
              )
            }
            aria-label={t("filterStatus")}
          >
            <option value="all">{t("filterAll")}</option>
            {PERSON_IMMIGRATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ti(value)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={expiryFilter}
            onChange={(e) => setExpiryFilter(e.target.value as ExpiryFilter)}
            aria-label={t("filterExpiry")}
          >
            <option value="all">{t("filterAll")}</option>
            <option value="expired">{t("filterExpiryExpired")}</option>
            <option value="expiring_30">{t("filterExpirySoon")}</option>
            <option value="no_date">{t("filterExpiryNone")}</option>
          </NativeSelect>
        </div>

        {filteredSorted.length === 0 ? (
          <p className={listMobileEmptyClassName}>
            {t("noMatches")}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredSorted.map((person) => {
              const fullName = `${person.first_name} ${person.last_name}`;
              return (
                <li key={person.id}>
                  <div className={cn("flex items-start gap-2", listMobileItemClassName)}>
                    <Link
                      href={`/partners/${person.partner_id || person.id}`}
                      className="min-w-0 flex-1 space-y-1"
                    >
                      <p className="font-medium text-brand">{fullName}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {person.email ?? t("emptyValue")}
                      </p>
                      <p className="text-sm text-brand/80">
                        {ti(person.immigration_status)}
                        {person.status_expires_at
                          ? ` · ${formatDisplayDate(person.status_expires_at, locale)}`
                          : ""}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {t("columnUpdated")}{" "}
                        {formatDisplayDate(person.updated_at, locale)}
                      </p>
                    </Link>
                    <DeletePersonButton
                      locale={locale}
                      personId={person.id}
                      fullName={fullName}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <ListLoadMore
          hasMore={hasMore}
          loading={loading || loadingMore}
          onLoadMore={loadMore}
          loadMoreLabel={t("loadMore")}
          loadingLabel={t("loadingMore")}
        />
      </div>

      <ListTableCard
        className={cn(
          "hidden md:block",
          listTableCardViewportClassName,
        )}
      >
        <div className={listTableScrollClassName} data-list-scroll="">
        <Table>
          <TableHeader className={listTableStickyHeaderClassName}>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn(
                  listTableHeadClassName,
                  listTableEdgeStartClassName,
                )}
              >
                <div className="flex flex-col gap-1.5">
                    <PeopleSortButton
                      column="name"
                      label={t("columnName")}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                  <Input
                    id="people-filter-name"
                    type="search"
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    placeholder={t("filterNamePlaceholder")}
                    aria-label={t("filterName")}
                    density="dense"
                  />
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <div className="flex flex-col gap-1.5">
                    <PeopleSortButton
                      column="email"
                      label={t("columnEmail")}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                  <Input
                    id="people-filter-email"
                    type="search"
                    value={emailQuery}
                    onChange={(e) => setEmailQuery(e.target.value)}
                    placeholder={t("filterEmailPlaceholder")}
                    aria-label={t("filterEmail")}
                    density="dense"
                  />
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <div className="flex flex-col gap-1.5">
                    <PeopleSortButton
                      column="immigration_status"
                      label={t("columnStatus")}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                  <NativeSelect
                    id="people-filter-status"
                    density="dense"
                    value={statusFilter}
                    onChange={(e) =>
                      setStatusFilter(
                        e.target.value as PersonImmigrationStatus | "all",
                      )
                    }
                    aria-label={t("filterStatus")}
                  >
                    <option value="all">{t("filterAll")}</option>
                    {PERSON_IMMIGRATION_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {ti(value)}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <div className="flex flex-col gap-1.5">
                    <PeopleSortButton
                      column="status_expires_at"
                      label={t("columnExpires")}
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                  <NativeSelect
                    id="people-filter-expiry"
                    density="dense"
                    value={expiryFilter}
                    onChange={(e) =>
                      setExpiryFilter(e.target.value as ExpiryFilter)
                    }
                    aria-label={t("filterExpiry")}
                  >
                    <option value="all">{t("filterAll")}</option>
                    <option value="expired">{t("filterExpiryExpired")}</option>
                    <option value="expiring_30">{t("filterExpirySoon")}</option>
                    <option value="no_date">{t("filterExpiryNone")}</option>
                  </NativeSelect>
                </div>
              </TableHead>
              <TableHead className={cn(listTableHeadClassName)}>
                <PeopleSortButton
                  column="updated_at"
                  label={t("columnUpdated")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead
                className={cn(
                  "w-12",
                  listTableHeadClassName,
                  listTableEdgeEndClassName,
                )}
              >
                <span className="sr-only">{t("delete")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={6}
                  className={listTableEmptyCellClassName}
                >
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              filteredSorted.map((person) => {
                const fullName = `${person.first_name} ${person.last_name}`;
                return (
                  <TableRow
                    key={person.id}
                    className="group cursor-pointer"
                    onClick={(event) => {
                      if (shouldIgnoreRowClick(event)) return;
                      router.push(`/partners/${person.partner_id || person.id}`);
                    }}
                  >
                    <TableCell className={cn("whitespace-normal", listTableEdgeStartClassName)}>
                      <Link
                        href={`/partners/${person.partner_id || person.id}`}
                        className="font-medium text-brand transition-colors hover:opacity-80"
                      >
                        {fullName}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {person.email ?? t("emptyValue")}
                    </TableCell>
                    <TableCell>{ti(person.immigration_status)}</TableCell>
                    <TableCell
                      className={cn(
                        "font-medium",
                        expiryClass(person.status_expires_at),
                      )}
                    >
                      {person.status_expires_at
                        ? formatDisplayDate(person.status_expires_at, locale)
                        : t("emptyValue")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDisplayDate(person.updated_at, locale)}
                    </TableCell>
                    <TableCell className={cn("text-right", listTableEdgeEndClassName)}>
                      <DeletePersonButton
                        locale={locale}
                        personId={person.id}
                        fullName={fullName}
                        className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-md:opacity-100"
                      />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <ListLoadMore
          hasMore={hasMore}
          loading={loading || loadingMore}
          onLoadMore={loadMore}
          loadMoreLabel={t("loadMore")}
          loadingLabel={t("loadingMore")}
        />
        </div>
      </ListTableCard>

      <div className={listFooterClassName}>
        <p className="text-sm text-muted-foreground">
          {t("showingCount", {
            shown: filteredSorted.length,
            total,
          })}
        </p>
        {filtersActive ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setNameQuery("");
              setEmailQuery("");
              setStatusFilter("all");
              setExpiryFilter("all");
            }}
          >
            {t("clearFilters")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
