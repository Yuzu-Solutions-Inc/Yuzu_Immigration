"use client";

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ClipboardList,
  FileText,
  type LucideIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  startTransition,
  useDeferredValue,
  useMemo,
  useState,
} from "react";

import { setProjectsStatusAction } from "@/app/actions/projects";
import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ProgramFamily, ProjectStatus } from "@/db/schema";
import { Link, useRouter } from "@/i18n/navigation";
import { SELECTABLE_PROGRAM_FAMILIES } from "@/lib/crm/programs";
import type { ProjectProgress } from "@/lib/crm/progress";
import type { ProjectRow } from "@/lib/crm/queries";
import { PROJECT_STATUSES, todayDateInputValue } from "@/lib/crm/statuses";
import { cn, shouldIgnoreRowClick } from "@/lib/utils";

type SortKey =
  | "title"
  | "program_family"
  | "created_at"
  | "submit_before"
  | "representative"
  | "documents"
  | "forms";
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

function compareNullableDates(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

const selectClassName =
  "h-8 w-full min-w-[8.5rem] rounded-lg border border-input bg-surface px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60";

const headerControlClassName =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-surface px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-60";

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
};

export function ProjectsTable({
  projects,
  members,
  progressById,
}: {
  projects: ProjectRow[];
  members: MemberOption[];
  progressById: Record<string, ProjectProgress>;
}) {
  const t = useTranslations("projects");
  const tprog = useTranslations("programs");
  const locale = useLocale();
  const router = useRouter();

  const [nameQuery, setNameQuery] = useState("");
  const deferredName = useDeferredValue(nameQuery);
  const [programFilter, setProgramFilter] = useState<ProgramFamily | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "all">(
    "all",
  );
  const [representativeFilter, setRepresentativeFilter] = useState<
    string | "all" | "unassigned"
  >("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<ProjectStatus>("in_progress");
  const [bulkStatusAt, setBulkStatusAt] = useState(todayDateInputValue());
  const [bulkPending, setBulkPending] = useState(false);

  const filteredSorted = useMemo(() => {
    const q = deferredName.trim().toLowerCase();
    const rows = projects.filter((project) => {
      if (q && !project.title.toLowerCase().includes(q)) return false;
      if (programFilter !== "all" && project.program_family !== programFilter) {
        return false;
      }
      if (statusFilter !== "all" && project.status !== statusFilter) {
        return false;
      }
      if (representativeFilter === "unassigned") {
        if (project.representative_user_id) return false;
      } else if (
        representativeFilter !== "all" &&
        project.representative_user_id !== representativeFilter
      ) {
        return false;
      }
      return true;
    });

    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "title") {
        cmp = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      } else if (sortKey === "program_family") {
        cmp = a.program_family.localeCompare(b.program_family);
      } else if (sortKey === "created_at") {
        cmp = a.created_at.localeCompare(b.created_at);
      } else if (sortKey === "representative") {
        const aLabel =
          a.representative?.full_name || a.representative?.email || "";
        const bLabel =
          b.representative?.full_name || b.representative?.email || "";
        cmp = aLabel.localeCompare(bLabel, undefined, { sensitivity: "base" });
      } else if (sortKey === "documents") {
        const aDocs = progressById[a.id] ?? EMPTY_PROGRESS;
        const bDocs = progressById[b.id] ?? EMPTY_PROGRESS;
        cmp =
          docsPercent(aDocs.docsDone, aDocs.docsTotal) -
          docsPercent(bDocs.docsDone, bDocs.docsTotal);
      } else if (sortKey === "forms") {
        const aForms = progressById[a.id] ?? EMPTY_PROGRESS;
        const bForms = progressById[b.id] ?? EMPTY_PROGRESS;
        cmp = aForms.formPercent - bForms.formPercent;
      } else {
        cmp = compareNullableDates(a.submit_before, b.submit_before);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [
    projects,
    deferredName,
    programFilter,
    statusFilter,
    representativeFilter,
    sortKey,
    sortDir,
    progressById,
  ]);

  const visibleIds = filteredSorted.map((p) => p.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;
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

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

      router.refresh();
    });
  }

  function onRowStatusChange(project: ProjectRow, nextStatus: ProjectStatus) {
    if (nextStatus === project.status) return;
    applyStatus([project.id], nextStatus, todayDateInputValue());
  }

  function openBulkDialog() {
    setBulkStatus("in_progress");
    setBulkStatusAt(todayDateInputValue());
    setBulkOpen(true);
  }

  function submitBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkPending(true);
    setError(null);

    startTransition(async () => {
      const result = await setProjectsStatusAction({
        locale,
        projectIds: ids,
        status: bulkStatus,
        statusAt: bulkStatusAt,
      });
      setBulkPending(false);

      if (result.error) {
        setError(errorLabel(result.error));
        return;
      }

      setBulkOpen(false);
      setSelected(new Set());
      router.refresh();
    });
  }

  if (projects.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <p className="text-sm text-brand">
            {t("selectedCount", { count: selected.size })}
          </p>
          <Button type="button" size="sm" onClick={openBulkDialog}>
            {t("bulkUpdateStatus")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            {t("clearSelection")}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <div className="space-y-3 md:hidden">
        <div className="grid gap-2 rounded-xl border border-border bg-surface p-3 shadow-elevated">
          <Input
            type="search"
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder={t("filterNamePlaceholder")}
            aria-label={t("filterName")}
            className="h-10"
          />
          <select
            value={programFilter}
            onChange={(e) =>
              setProgramFilter(e.target.value as ProgramFamily | "all")
            }
            aria-label={t("filterProgram")}
            className={cn(headerControlClassName, "h-10")}
          >
            <option value="all">{t("filterAll")}</option>
            {SELECTABLE_PROGRAM_FAMILIES.map((value) => (
              <option key={value} value={value}>
                {tprog(value)}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ProjectStatus | "all")
            }
            aria-label={t("filterStatus")}
            className={cn(headerControlClassName, "h-10")}
          >
            <option value="all">{t("filterAll")}</option>
            {PROJECT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(`statuses.${value}`)}
              </option>
            ))}
          </select>
        </div>

        {filteredSorted.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-[15px] text-muted-foreground">
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
                    className="block space-y-2 rounded-xl border border-border bg-surface p-3 shadow-elevated"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium text-brand">
                        {project.title}
                      </p>
                      <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-brand">
                        {t(`statuses.${project.status}`)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {project.organization_program_name ||
                        tprog(project.program_family)}
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
      </div>

      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-elevated md:block">
        <Table>
          <TableHeader className="[&_tr:first-child]:border-b-0">
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 px-3">
                <input
                  type="checkbox"
                  className="size-4 accent-action"
                  checked={allVisibleSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleSelected;
                  }}
                  onChange={toggleAllVisible}
                  aria-label={t("selectAll")}
                  disabled={visibleIds.length === 0}
                />
              </TableHead>
              <TableHead className="min-w-[12rem]">
                <SortButton
                  column="title"
                  label={t("columnName")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead className="min-w-[10rem]">
                <SortButton
                  column="program_family"
                  label={t("columnProgram")}
                  sortKey={sortKey}
                  sortDir={sortDir}
                  onToggle={toggleSort}
                />
              </TableHead>
              <TableHead className="min-w-[10rem]">
                <span className="px-0.5 py-0.5 font-medium">
                  {t("columnStatus")}
                </span>
              </TableHead>
              <TableHead className="min-w-[10rem]">
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
                  column="created_at"
                  label={t("columnCreated")}
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
              <TableHead className="w-12 px-1.5">
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
              <TableHead className="h-auto w-10 px-3 pb-2.5 pt-0" />
              <TableHead className="h-auto min-w-[12rem] pb-2.5 pt-0">
                <Input
                  id="projects-filter-name"
                  type="search"
                  value={nameQuery}
                  onChange={(e) => setNameQuery(e.target.value)}
                  placeholder={t("filterNamePlaceholder")}
                  aria-label={t("filterName")}
                  className={headerControlClassName}
                />
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] pb-2.5 pt-0">
                <select
                  id="projects-filter-program"
                  value={programFilter}
                  onChange={(e) =>
                    setProgramFilter(e.target.value as ProgramFamily | "all")
                  }
                  aria-label={t("filterProgram")}
                  className={headerControlClassName}
                >
                  <option value="all">{t("filterAll")}</option>
                  {SELECTABLE_PROGRAM_FAMILIES.map((value) => (
                    <option key={value} value={value}>
                      {tprog(value)}
                    </option>
                  ))}
                </select>
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] pb-2.5 pt-0">
                <select
                  id="projects-filter-status"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as ProjectStatus | "all")
                  }
                  aria-label={t("filterStatus")}
                  className={headerControlClassName}
                >
                  <option value="all">{t("filterAll")}</option>
                  {PROJECT_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {t(`statuses.${value}`)}
                    </option>
                  ))}
                </select>
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] pb-2.5 pt-0">
                <select
                  id="projects-filter-rep"
                  value={representativeFilter}
                  onChange={(e) =>
                    setRepresentativeFilter(
                      e.target.value as string | "all" | "unassigned",
                    )
                  }
                  aria-label={t("filterRepresentative")}
                  className={headerControlClassName}
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
                </select>
              </TableHead>
              <TableHead className="h-auto pb-2.5 pt-0" />
              <TableHead className="h-auto pb-2.5 pt-0" />
              <TableHead className="h-auto pb-2.5 pt-0" />
              <TableHead className="h-auto pb-2.5 pt-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={9}
                  className="px-5 py-8 text-center whitespace-normal text-[15px] text-muted-foreground"
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
                    data-state={selected.has(project.id) ? "selected" : undefined}
                    className="cursor-pointer"
                    onClick={(event) => {
                      if (shouldIgnoreRowClick(event)) return;
                      router.push(`/projects/${project.id}`);
                    }}
                  >
                    <TableCell className="px-3">
                      <input
                        type="checkbox"
                        className="size-4 accent-action"
                        checked={selected.has(project.id)}
                        onChange={() => toggleOne(project.id)}
                        aria-label={t("selectRow", { title: project.title })}
                      />
                    </TableCell>
                    <TableCell className="max-w-[18rem] whitespace-normal">
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium text-brand hover:underline"
                      >
                        {project.title}
                      </Link>
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
                      <select
                        value={project.status}
                        disabled={isPending}
                        onChange={(e) =>
                          onRowStatusChange(
                            project,
                            e.target.value as ProjectStatus,
                          )
                        }
                        className={selectClassName}
                        aria-label={t("editStatusAria")}
                      >
                        {PROJECT_STATUSES.map((value) => (
                          <option key={value} value={value}>
                            {t(`statuses.${value}`)}
                          </option>
                        ))}
                      </select>
                    </TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">
                      {project.representative?.full_name ||
                        project.representative?.email ||
                        t("representativeUnassigned")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(project.created_at, locale) ?? "—"}
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
                    <TableCell className="w-12 px-1.5">
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {t("showingCount", {
            shown: filteredSorted.length,
            total: projects.length,
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

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("bulkUpdateStatusTitle")}</DialogTitle>
            <DialogDescription>
              {t("bulkUpdateStatusHint", { count: selected.size })}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-status">{t("status")}</Label>
              <select
                id="bulk-status"
                value={bulkStatus}
                onChange={(e) => {
                  setBulkStatus(e.target.value as ProjectStatus);
                  setBulkStatusAt(todayDateInputValue());
                }}
                className={cn(selectClassName, "h-10")}
              >
                {PROJECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`statuses.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-status-at">{t("statusAt")}</Label>
              <Input
                id="bulk-status-at"
                type="date"
                value={bulkStatusAt}
                onChange={(e) => setBulkStatusAt(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t("statusAtHelp")}</p>
            </div>
          </div>

          <DialogFooter className="px-0! mx-0! mb-0! border-0 bg-transparent p-0!">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkOpen(false)}
              disabled={bulkPending}
            >
              {t("cancel")}
            </Button>
            <Button type="button" onClick={submitBulk} disabled={bulkPending}>
              {bulkPending ? t("savingStatus") : t("updateStatus")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
