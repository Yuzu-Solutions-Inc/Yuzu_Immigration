"use client";

import { History, Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateProjectStatusAction,
  type StatusUpdateState,
} from "@/app/actions/projects";
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
import type { ProjectStatus } from "@/db/schema";
import type { ProjectStatusHistoryRow } from "@/lib/crm/queries";
import { PROJECT_STATUSES, todayDateInputValue } from "@/lib/crm/statuses";
import { cn } from "@/lib/utils";

const initialState: StatusUpdateState = {};

function formatStatusDate(isoDate: string, locale: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

export function ProjectStatusCard({
  locale,
  projectId,
  currentStatus,
  currentStatusAt,
  history = [],
}: {
  locale: string;
  projectId: string;
  currentStatus: ProjectStatus;
  currentStatusAt: string;
  history?: ProjectStatusHistoryRow[];
}) {
  const t = useTranslations("projects");
  const [editOpen, setEditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>(currentStatus);
  const [statusAt, setStatusAt] = useState(
    currentStatusAt || todayDateInputValue(),
  );
  const [state, formAction, pending] = useActionState(
    updateProjectStatusAction,
    initialState,
  );

  useEffect(() => {
    if (editOpen) {
      setStatus(currentStatus);
      setStatusAt(currentStatusAt || todayDateInputValue());
    }
  }, [editOpen, currentStatus, currentStatusAt]);

  function onStatusChange(next: ProjectStatus) {
    setStatus(next);
    setStatusAt(todayDateInputValue());
  }

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        update_failed: t("errors.updateFailed"),
        not_found: t("errors.notFound"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <>
      <div className="px-4 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            className={cn(
              "group min-w-0 flex-1 rounded-lg text-left transition-colors",
              "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
            )}
            aria-label={t("editStatusAria")}
          >
            <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
              {t("status")}
            </p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <p className="truncate text-sm font-semibold text-brand">
                {t(`statuses.${currentStatus}`)}
              </p>
              <Pencil
                className="size-3 shrink-0 text-muted-foreground opacity-70 group-hover:text-action"
                aria-hidden
              />
            </div>
            <p className="truncate text-xs text-muted-foreground">
              {t("statusSince", {
                date: formatStatusDate(currentStatusAt, locale),
              })}
            </p>
          </button>
          <Button
            type="button"
            variant="outline"
            size="icon-xs"
            onClick={() => setHistoryOpen(true)}
            aria-label={t("viewStatusHistory")}
            title={t("viewStatusHistory")}
          >
            <History className="size-3.5" />
          </Button>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("updateStatusTitle")}</DialogTitle>
            <DialogDescription>{t("updateStatusHint")}</DialogDescription>
          </DialogHeader>

          <form action={formAction} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="statusAt" value={statusAt} />

            <div className="space-y-2">
              <Label htmlFor="status-modal">{t("status")}</Label>
              <select
                id="status-modal"
                value={status}
                onChange={(e) =>
                  onStatusChange(e.target.value as ProjectStatus)
                }
                className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                {PROJECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`statuses.${value}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="statusAt-modal">{t("statusAt")}</Label>
              <Input
                id="statusAt-modal"
                type="date"
                value={statusAt}
                onChange={(e) => setStatusAt(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">{t("statusAtHelp")}</p>
            </div>

            {errorMessage ? (
              <p className="text-sm text-destructive" role="alert">
                {errorMessage}
              </p>
            ) : null}

            <DialogFooter className="px-0! mx-0! mb-0! border-0 bg-transparent p-0!">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={pending}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? t("savingStatus") : t("updateStatus")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("statusHistoryTitle")}</DialogTitle>
            <DialogDescription>{t("statusHistoryHint")}</DialogDescription>
          </DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("statusHistoryEmpty")}
            </p>
          ) : (
            <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <p className="text-sm font-medium text-brand">
                    {t(`statuses.${entry.status}`)}
                  </p>
                  <p className="shrink-0 text-xs text-muted-foreground">
                    {formatStatusDate(entry.status_at, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** @deprecated Prefer ProjectStatusCard */
export function ProjectStatusUpdateForm(props: {
  locale: string;
  projectId: string;
  currentStatus: ProjectStatus;
  currentStatusAt: string;
}) {
  return <ProjectStatusCard {...props} />;
}
