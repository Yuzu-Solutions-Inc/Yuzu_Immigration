"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  startTransition,
  useDeferredValue,
  useMemo,
  useState,
} from "react";

import { setProjectsStatusAction } from "@/app/actions/projects";
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
import type { ProjectRow } from "@/lib/crm/queries";
import { PROJECT_STATUSES, todayDateInputValue } from "@/lib/crm/statuses";
import { cn } from "@/lib/utils";

type SortKey =
  | "title"
  | "program_family"
  | "created_at"
  | "submit_before"
  | "representative";
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

export function ProjectsTable({
  projects,
  members,
}: {
  projects: ProjectRow[];
  members: MemberOption[];
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-auto w-10 px-3 py-2.5 align-top">
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
              <TableHead className="h-auto min-w-[12rem] py-2.5 align-top">
                <div className="flex flex-col gap-1.5">
                  <SortButton column="title" label={t("columnName")} />
                  <Input
                    id="projects-filter-name"
                    type="search"
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    placeholder={t("filterNamePlaceholder")}
                    aria-label={t("filterName")}
                    className={headerControlClassName}
                  />
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] py-2.5 align-top">
                <div className="flex flex-col gap-1.5">
                  <SortButton
                    column="program_family"
                    label={t("columnProgram")}
                  />
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
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] py-2.5 align-top">
                <div className="flex flex-col gap-1.5">
                  <span className="px-0.5 py-0.5 font-medium">
                    {t("columnStatus")}
                  </span>
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
                </div>
              </TableHead>
              <TableHead className="h-auto min-w-[10rem] py-2.5 align-top">
                <div className="flex flex-col gap-1.5">
                  <SortButton
                    column="representative"
                    label={t("columnRepresentative")}
                  />
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
                </div>
              </TableHead>
              <TableHead className="h-auto py-2.5 align-top">
                <SortButton column="created_at" label={t("columnCreated")} />
              </TableHead>
              <TableHead className="h-auto py-2.5 align-top">
                <SortButton
                  column="submit_before"
                  label={t("columnSubmitBefore")}
                />
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSorted.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell
                  colSpan={7}
                  className="px-5 py-8 text-center whitespace-normal text-[15px] text-muted-foreground"
                >
                  {t("noMatches")}
                </TableCell>
              </TableRow>
            ) : (
              filteredSorted.map((project) => {
                const isPending = pendingIds.has(project.id);
                return (
                  <TableRow
                    key={project.id}
                    data-state={selected.has(project.id) ? "selected" : undefined}
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
                      {tprog(project.program_family)}
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
