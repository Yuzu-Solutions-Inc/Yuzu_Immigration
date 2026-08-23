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
import { Field, FieldError, FieldHint, FieldLabel, FormStack } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusPill } from "@/components/ui/status-pill";
import type { ProjectStatus } from "@/db/schema";
import type { ProjectStatusHistoryRow } from "@/lib/crm/queries";
import {
  PROJECT_STATUSES,
  projectStatusTone,
  todayDateInputValue,
} from "@/lib/crm/statuses";

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
        trial_expired: t("errors.trialExpired"),
      }[state.error] ?? t("errors.generic")
    : null;

  const pillLabel = t(`statuses.${currentStatus}`);

  return (
    <>
      <div className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setEditOpen(true)}
          className="group relative inline-flex max-w-full items-center rounded-full text-left transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
          aria-label={t("editStatusAria")}
        >
          <StatusPill
            label={pillLabel}
            tone={projectStatusTone(currentStatus)}
            className="max-w-full gap-1.5 pr-7 group-hover:ring-2 group-hover:ring-action/20 group-focus-visible:ring-2 group-focus-visible:ring-action/20"
          />
          <Pencil
            className="pointer-events-none absolute right-2.5 size-3 shrink-0 text-current opacity-50 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            aria-hidden
          />
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="text-muted-foreground"
          onClick={() => setHistoryOpen(true)}
          aria-label={t("viewStatusHistory")}
          title={t("viewStatusHistory")}
        >
          <History className="size-3.5" />
        </Button>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("updateStatusTitle")}</DialogTitle>
            <DialogDescription>{t("updateStatusHint")}</DialogDescription>
          </DialogHeader>

          <FormStack action={formAction} gap="tight">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="statusAt" value={statusAt} />

            <Field>
              <FieldLabel htmlFor="status-modal">{t("status")}</FieldLabel>
              <NativeSelect
                id="status-modal"
                value={status}
                onChange={(e) =>
                  onStatusChange(e.target.value as ProjectStatus)
                }
              >
                {PROJECT_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`statuses.${value}`)}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="statusAt-modal" required>
                {t("statusAt")}
              </FieldLabel>
              <Input
                id="statusAt-modal"
                type="date"
                value={statusAt}
                onChange={(e) => setStatusAt(e.target.value)}
                required
              />
              <FieldHint>{t("statusAtHelp")}</FieldHint>
            </Field>

            {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

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
          </FormStack>
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
