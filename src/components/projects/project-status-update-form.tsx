"use client";

import { Pencil } from "lucide-react";
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
import { PROJECT_STATUSES, todayDateInputValue } from "@/lib/crm/statuses";
import { cn } from "@/lib/utils";

const initialState: StatusUpdateState = {};

function formatStatusDate(isoDate: string, locale: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

export function ProjectStatusCard({
  locale,
  projectId,
  currentStatus,
  currentStatusAt,
}: {
  locale: "en" | "fr";
  projectId: string;
  currentStatus: ProjectStatus;
  currentStatusAt: string;
}) {
  const t = useTranslations("projects");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ProjectStatus>(currentStatus);
  const [statusAt, setStatusAt] = useState(
    currentStatusAt || todayDateInputValue(),
  );
  const [state, formAction, pending] = useActionState(
    updateProjectStatusAction,
    initialState,
  );

  useEffect(() => {
    if (open) {
      setStatus(currentStatus);
      setStatusAt(currentStatusAt || todayDateInputValue());
    }
  }, [open, currentStatus, currentStatusAt]);

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "group w-full rounded-xl border border-border bg-surface p-6 text-left shadow-elevated transition-colors",
          "hover:border-action/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30",
        )}
        aria-label={t("editStatusAria")}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("status")}
            </p>
            <p className="font-heading text-lg font-semibold text-brand">
              {t(`statuses.${currentStatus}`)}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("statusSince", {
                date: formatStatusDate(currentStatusAt, locale),
              })}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex size-8 items-center justify-center rounded-lg border border-transparent text-muted-foreground transition-all",
              "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100",
              "group-hover:border-border group-hover:bg-surface group-hover:text-action",
            )}
          >
            <Pencil className="size-3.5" aria-hidden />
          </span>
        </div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
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
                onClick={() => setOpen(false)}
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
    </>
  );
}

/** @deprecated Prefer ProjectStatusCard */
export function ProjectStatusUpdateForm(props: {
  locale: "en" | "fr";
  projectId: string;
  currentStatus: ProjectStatus;
  currentStatusAt: string;
}) {
  return <ProjectStatusCard {...props} />;
}
