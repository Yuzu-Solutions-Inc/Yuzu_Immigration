"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { DeletePersonButton } from "@/components/people/delete-person-button";
import {
  ListTableCard,
  listMobileEmptyClassName,
  listMobileFiltersStackClassName,
  listMobileFiltersClassName,
  listMobileItemClassName,
  listStackClassName,
  listTableEdgeEndClassName,
  listTableEdgeStartClassName,
  listTableEmptyCellClassName,
  listTableHeadClassName,
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
import type { PersonImmigrationStatus } from "@/db/schema";
import { Link, useRouter } from "@/i18n/navigation";
import { daysUntilIso, formatDisplayDate } from "@/lib/crm/dates";
import { PERSON_IMMIGRATION_STATUSES } from "@/lib/crm/person-status";
import type { PersonRow } from "@/lib/crm/queries";
import { cn, shouldIgnoreRowClick } from "@/lib/utils";

type SortKey = "name" | "email" | "immigration_status" | "status_expires_at";
type SortDir = "asc" | "desc";
type ExpiryFilter = "all" | "expired" | "expiring_30" | "no_date";

function compareNullableDates(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function expiryClass(isoDate: string | null) {
  if (!isoDate) return "text-muted-foreground";
  const days = daysUntilIso(isoDate);
  if (days < 0) return "text-destructive";
  if (days <= 7) return "text-warning-text";
  return "text-muted-foreground";
}

export function PeopleList({
  locale,
  people,
}: {
  locale: string;
  people: PersonRow[];
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
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const deferredName = useDeferredValue(nameQuery);
  const deferredEmail = useDeferredValue(emailQuery);

  const filteredSorted = useMemo(() => {
    const nameQ = deferredName.trim().toLowerCase();
    const emailQ = deferredEmail.trim().toLowerCase();

    const rows = people.filter((person) => {
      if (nameQ) {
        const fullName = `${person.first_name} ${person.last_name}`.toLowerCase();
        if (!fullName.includes(nameQ)) return false;
      }
      if (emailQ) {
        if (!(person.email ?? "").toLowerCase().includes(emailQ)) return false;
      }
      if (statusFilter !== "all" && person.immigration_status !== statusFilter) {
        return false;
      }
      if (expiryFilter === "no_date") {
        if (person.status_expires_at) return false;
      } else if (expiryFilter === "expired") {
        if (
          !person.status_expires_at ||
          daysUntilIso(person.status_expires_at) >= 0
        ) {
          return false;
        }
      } else if (expiryFilter === "expiring_30") {
        if (!person.status_expires_at) return false;
        const days = daysUntilIso(person.status_expires_at);
        if (days < 0 || days > 30) return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") {
        cmp = `${a.last_name} ${a.first_name}`.localeCompare(
          `${b.last_name} ${b.first_name}`,
          undefined,
          { sensitivity: "base" },
        );
      } else if (sortKey === "email") {
        cmp = (a.email ?? "").localeCompare(b.email ?? "", undefined, {
          sensitivity: "base",
        });
      } else if (sortKey === "immigration_status") {
        cmp = ti(a.immigration_status).localeCompare(
          ti(b.immigration_status),
          undefined,
          { sensitivity: "base" },
        );
      } else {
        cmp = compareNullableDates(a.status_expires_at, b.status_expires_at);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [
    people,
    deferredName,
    deferredEmail,
    statusFilter,
    expiryFilter,
    sortKey,
    sortDir,
    ti,
  ]);

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
    setSortDir("asc");
  }

  function SortButton({
    column,
    label,
  }: {
    column: SortKey;
    label: string;
  }) {
    const active = sortKey === column;
    const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(column)}
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

  return (
    <div className={listStackClassName}>
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
                      href={`/people/${person.id}`}
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
      </div>

      <ListTableCard className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead
                className={cn(
                  "min-w-[12rem]",
                  listTableHeadClassName,
                  listTableEdgeStartClassName,
                )}
              >
                <div className="flex flex-col gap-1.5">
                  <SortButton column="name" label={t("columnName")} />
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
              <TableHead className={cn("min-w-[12rem]", listTableHeadClassName)}>
                <div className="flex flex-col gap-1.5">
                  <SortButton column="email" label={t("columnEmail")} />
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
              <TableHead className={cn("min-w-[10rem]", listTableHeadClassName)}>
                <div className="flex flex-col gap-1.5">
                  <SortButton
                    column="immigration_status"
                    label={t("columnStatus")}
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
              <TableHead className={cn("min-w-[10rem]", listTableHeadClassName)}>
                <div className="flex flex-col gap-1.5">
                  <SortButton
                    column="status_expires_at"
                    label={t("columnExpires")}
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
                  colSpan={5}
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
                      router.push(`/people/${person.id}`);
                    }}
                  >
                    <TableCell className={cn("whitespace-normal", listTableEdgeStartClassName)}>
                      <Link
                        href={`/people/${person.id}`}
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
      </ListTableCard>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("showingCount", {
            shown: filteredSorted.length,
            total: people.length,
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
