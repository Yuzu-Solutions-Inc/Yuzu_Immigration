"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ClipboardList,
  FileText,
  ScanEye,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  startTransition,
  useCallback,
  useMemo,
  useState,
} from "react";

import { loadProjectsPageAction } from "@/app/actions/list-pages";
import { setProjectsStatusAction } from "@/app/actions/projects";
import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
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
  listTableScrollClassName,
  listTableStickyHeaderClassName,
  listViewportStackClassName,
} from "@/components/layout/list-layout";
import { ListLoadMore } from "@/components/layout/list-load-more";
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
import type { ProgramFamily, ProjectStatus } from "@/db/schema";
import { Link, useRouter } from "@/i18n/navigation";
import { SELECTABLE_PROGRAM_FAMILIES } from "@/lib/crm/programs";
import type { ProjectProgress } from "@/lib/crm/progress";
import type {
  ProjectRow,
  ProjectsListPage,
  ProjectsListSortKey,
} from "@/lib/crm/queries";
import { PROJECT_STATUSES, todayDateInputValue } from "@/lib/crm/statuses";
import { cn, shouldIgnoreRowClick } from "@/lib/utils";

type SortKey = ProjectsListSortKey;
type SortDir = "asc" | "desc";

type MemberOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

function staffLabel(member: MemberOption | null | undefined) {
  if (!member) return "";
  return member.full_name || member.email || "";
}

function formatDate(isoDate: string | null, locale: string) {
  if (!isoDate) return null;
  const day = isoDate.slice(0, 10);
  return new Date(`${day}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

function SortButton({
  column,
  label,
  icon: HeaderIcon,
  sortKey,
  sortDir,
  onToggle,
}: {
  column: SortKey;
  label: string;
  icon?: LucideIcon;
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
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center rounded-md px-0.5 py-0.5 font-medium transition-colors",
        "hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        HeaderIcon ? "justify-center gap-0.5" : "gap-1 text-left",
        active ? "text-brand" : "text-foreground",
      )}
    >
      {HeaderIcon ? (
        <HeaderIcon className="size-3.5" aria-hidden />
      ) : (
        label
      )}
      {HeaderIcon && !active ? null : (
        <Icon className="size-3 shrink-0 opacity-70" aria-hidden />
      )}
    </button>
  );
}

const EMPTY_PROGRESS: ProjectProgress = {
  docsDone: 0,
  docsTotal: 0,
  formPercent: 0,
  docsToReview: 0,
};

function DocsToReviewIcon({
  count,
  href,
}: {
  count: number;
  href?: string;
}) {
  const t = useTranslations("projects");
  if (count <= 0) return null;

  const label = t("docsToReviewIcon", { count });
  const icon = (
    <span
      title={href ? undefined : label}
      aria-label={href ? undefined : label}
      className="inline-flex shrink-0 items-center rounded-md bg-action/10 p-1 text-action"
    >
      <ScanEye className="size-3.5" aria-hidden />
    </span>
  );
  if (!href) return icon;
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center rounded-md bg-action/10 p-1 text-action hover:bg-action/15"
    >
      <ScanEye className="size-3.5" aria-hidden />
    </Link>
  );
}

export function ProjectsTable({
  initial,
  members,
}: {
  initial: ProjectsListPage;
  members: MemberOption[];
}) {
  const t = useTranslations("projects");
  const tprog = useTranslations("programs");
  const locale = useLocale();
  const router = useRouter();

  const [nameQuery, setNameQuery] = useState("");
  const debouncedName = useDebouncedValue(nameQuery);
  const [programFilter, setProgramFilter] = useState<ProgramFamily | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">(
    "all",
  );
  const [representativeFilter, setRepresentativeFilter] = useState<
    string | "all" | "unassigned"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [progressById, setProgressById] = useState(initial.progressById);
  const [statusOverrides, setStatusOverrides] = useState<
    Record<string, ProjectStatus>
  >({});

  const filters = useMemo(
    () => ({
      titleQuery: debouncedName,
      program: programFilter,
      status: statusFilter,
      representative: representativeFilter,
      sortKey,
      sortDir,
    }),
    [
      debouncedName,
      programFilter,
      statusFilter,
      representativeFilter,
      sortKey,
      sortDir,
    ],
  );
  const fetchPage = useCallback(
    async (offset: number) => {
      const page = await loadProjectsPageAction({ ...filters, offset });
      setProgressById((prev) =>
        offset === 0 ? page.progressById : { ...prev, ...page.progressById },
      );
      if (offset === 0) setStatusOverrides({});
      return page;
    },
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
      programFilter !== "all" ||
      statusFilter !== "all" ||
      representativeFilter !== "all",
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((dir) => (dir === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(key === "title" || key === "program_family" ? "asc" : "desc");
  }

  function errorLabel(code?: string) {
    if (!code) return t("errors.generic");
    return (
      {
        invalid: t("errors.invalid"),
        update_failed: t("errors.updateFailed"),
        not_found: t("errors.notFound"),
      }[code] ?? t("errors.generic")
    );
  }

  function applyStatus(projectIds: string[], status: ProjectStatus, statusAt: string) {
    setError(null);
    setPendingIds((prev) => {
      const next = new Set(prev);
      for (const id of projectIds) next.add(id);
      return next;
    });

    startTransition(async () => {
      const result = await setProjectsStatusAction({
        locale,
        projectIds,
        status,
        statusAt,
      });

      setPendingIds((prev) => {
        const next = new Set(prev);
        for (const id of projectIds) next.delete(id);
        return next;
      });

      if (result.error) {
        setError(errorLabel(result.error));
        return;
      }

      setStatusOverrides((prev) => {
        const next = { ...prev };
        for (const id of projectIds) next[id] = status;
        return next;
      });
      router.refresh();
    });
  }

  function rowStatus(project: ProjectRow): ProjectStatus {
    return statusOverrides[project.id] ?? project.status;
  }

  function onRowStatusChange(project: ProjectRow, nextStatus: ProjectStatus) {
    if (nextStatus === rowStatus(project)) return;
    applyStatus([project.id], nextStatus, todayDateInputValue());
  }

  return (
    <div className={listViewportStackClassName} aria-busy={loading || loadingMore}>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className={listMobileFiltersStackClassName}>
        <div className={listMobileFiltersClassName}>
          <Input
            type="search"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder={t("filterNamePlaceholder")}
            aria-label={t("filterName")}
          />
          <NativeSelect
            value={programFilter}
            onChange={(e) =>
              setProgramFilter(e.target.value as ProgramFamily | "all")
            }
            aria-label={t("filterProgram")}
            >
            <option value="all">{t("filterAll")}</option>
            {SELECTABLE_PROGRAM_FAMILIES.map((value) => (
              <option key={value} value={value}>
                {tprog(value)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ProjectStatus | "all")
            }
            aria-label={t("filterStatus")}
            >
            <option value="all">{t("filterAll")}</option>
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`statuses.${value}`)}
              </option>
            ))}
          </NativeSelect>
        </div>

        {filteredSorted.length === 0 ? (
          <p className={listMobileEmptyClassName}>
            {t("noMatches")}
          </p>
        ) : (
          <ul className="space-y-2">
            {filteredSorted.map((project) => {
              const progress = progressById[project.id] ?? EMPTY_PROGRESS;
              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    className={cn("block space-y-2", listMobileItemClassName)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="min-w-0 font-medium text-brand">
                          {project.title}
                        </p>
                        <DocsToReviewIcon count={progress.docsToReview} />
                      </div>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-brand">
                        {t(`statuses.${rowStatus(project)}`)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {project.organization_program_name ||
                        tprog(project.program_family)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("columnUpdated")}:{" "}
                      {formatDate(project.updated_at, locale) ?? "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("columnSubmitBefore")}:{" "}
                      {formatDate(project.submit_before, locale) ??
                        t("submitBeforeEmpty")}
                    </p>
                    <div className="flex gap-4">
                      <ProgressMeter
                        compact
                        valueLabel={t("docsProgress", {
                          done: progress.docsDone,
                          total: progress.docsTotal,
                        })}
                        percent={docsPercent(
                          progress.docsDone,
                          progress.docsTotal,
                        )}
                      />
                      <ProgressMeter
                        compact
                        valueLabel={t("formsProgress", {
                          percent: progress.formPercent,
                        })}
                        percent={progress.formPercent}
                      />
                    </div>
                  </Link>
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
        className={cn("hidden md:block", listTableCardViewportClassName)}
      >
        <div className={listTableScrollClassName} data-list-scroll="">
        <Table>
          <TableHeader className={cn(listTableStickyHeaderClassName, "[&_tr:first-child]:border-b-0")}>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(listTableEdgeStartClassName)}>
                <SortButton
                  column="title"
                  label={t("columnName")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  column="program_family"
                  label={t("columnProgram")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>
                <span className="px-0.5 py-0.5 font-medium">
                  {t("columnStatus")}
                </span>
              </TableHead>
              <TableHead>
                <SortButton
                  column="representative"
                  label={t("columnRepresentative")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  column="updated_at"
                  label={t("columnUpdated")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead>
                <SortButton
                  column="submit_before"
                  label={t("columnSubmitBefore")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead className="w-12 px-1.5">
                <SortButton
                  column="documents"
                  label={t("columnDocuments")}
                  icon={FileText}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead className={cn("w-12 px-1.5", listTableEdgeEndClassName)}>
                <SortButton
                  column="forms"
                  label={t("columnForms")}
                  icon={ClipboardList}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
            </TableRow>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn("h-auto pb-2.5 pt-0", listTableEdgeStartClassName)}>
                <Input
                  id="projects-filter-name"
                  type="search"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  placeholder={t("filterNamePlaceholder")}
                  aria-label={t("filterName")}
                  density="dense"
                />
              </TableHead>
              <TableHead className="h-auto pb-2.5 pt-0">
                <NativeSelect
                  id="projects-filter-program"
                  value={programFilter}
                  onChange={(e) =>
                    setProgramFilter(e.target.value as ProgramFamily | "all")
                  }
                  aria-label={t("filterProgram")}
                  density="dense"
                >
                  <option value="all">{t("filterAll")}</option>
                  {SELECTABLE_PROGRAM_FAMILIES.map((value) => (
                    <option key={value} value={value}>
                      {tprog(value)}
                    </option>
                  ))}
                </NativeSelect>
              </TableHead>
              <TableHead className="h-auto pb-2.5 pt-0">
                <NativeSelect
                  id="projects-filter-status"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as ProjectStatus | "all")
                  }
                  aria-label={t("filterStatus")}
                  density="dense"
                >
                  <option value="all">{t("filterAll")}</option>
                  {PROJECT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {t(`statuses.${value}`)}
                    </option>
                  ))}
                </NativeSelect>
              </TableHead>
              <TableHead className="h-auto pb-2.5 pt-0">
                <NativeSelect
                  id="projects-filter-rep"
                  value={representativeFilter}
                  onChange={(e) =>
                    setRepresentativeFilter(
                      e.target.value as string | "all" | "unassigned",
                    )
                  }
                  aria-label={t("filterRepresentative")}
                  density="dense"
                >
                  <option value="all">{t("filterAll")}</option>
                  <option value="unassigned">
                    {t("representativeUnassigned")}
                  </option>
                  {members.map((member) => (
                    <option key={member.user_id} value={member.user_id}>
                      {staffLabel(member) || member.user_id}
                    </option>
                  ))}
                </NativeSelect>
              </TableHead>
              <TableHead className="h-auto pb-2.5 pt-0" />
              <TableHead className="h-auto pb-2.5 pt-0" />
              <TableHead className="h-auto pb-2.5 pt-0" />
              <TableHead className={cn("h-auto pb-2.5 pt-0", listTableEdgeEndClassName)} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={8}
                  className={listTableEmptyCellClassName}
                >
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              filteredSorted.map((project) => {
                const isPending = pendingIds.has(project.id);
                const progress = progressById[project.id] ?? EMPTY_PROGRESS;
                return (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer"
                    onClick={(event) => {
                      if (shouldIgnoreRowClick(event)) return;
                      router.push(`/projects/${project.id}`);
                    }}
                  >
                    <TableCell className={cn("whitespace-normal", listTableEdgeStartClassName)}>
                      <div className="flex items-start gap-1.5">
                        <Link
                          href={`/projects/${project.id}`}
                          className="font-medium text-brand hover:underline"
                        >
                          {project.title}
                        </Link>
                        <DocsToReviewIcon
                          count={progress.docsToReview}
                          href={`/projects/review?project=${project.id}`}
                        />
                      </div>
                      {project.jurisdiction !== "federal" ? (
                        <p className="text-xs text-muted-foreground">
                          {t(`jurisdictions.${project.jurisdiction}`)}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      {project.organization_program_name ||
                        tprog(project.program_family)}
                    </TableCell>
                    <TableCell>
                      <NativeSelect
                        value={rowStatus(project)}
                        disabled={isPending}
                        onChange={(e) =>
                          onRowStatusChange(
                            project,
                            e.target.value as ProjectStatus,
                          )
                        }
                        density="dense"
                        className="w-full min-w-0"
                        aria-label={t("editStatusAria")}
                        >
                        {PROJECT_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {t(`statuses.${value}`)}
                          </option>
                        ))}
                      </NativeSelect>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {project.representative?.full_name ||
                        project.representative?.email ||
                        t("representativeUnassigned")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(project.updated_at, locale) ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(project.submit_before, locale) ??
                        t("submitBeforeEmpty")}
                    </TableCell>
                    <TableCell className="w-12 px-1.5">
                      <ProgressMeter
                        compact
                        valueLabel={t("docsProgress", {
                          done: progress.docsDone,
                          total: progress.docsTotal,
                        })}
                        percent={docsPercent(
                          progress.docsDone,
                          progress.docsTotal,
                        )}
                      />
                    </TableCell>
                    <TableCell className={cn("w-12 px-1.5", listTableEdgeEndClassName)}>
                      <ProgressMeter
                        compact
                        valueLabel={t("formsProgress", {
                          percent: progress.formPercent,
                        })}
                        percent={progress.formPercent}
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
              setProgramFilter("all");
              setStatusFilter("all");
              setRepresentativeFilter("all");
            }}
          >
            {t("clearFilters")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
