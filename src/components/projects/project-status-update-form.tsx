"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateProjectStatusAction,
  type StatusUpdateState,
} from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectStatus } from "@/db/schema";
import { PROJECT_STATUSES, todayDateInputValue } from "@/lib/crm/statuses";

const initialState: StatusUpdateState = {};

export function ProjectStatusUpdateForm({
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
  const [status, setStatus] = useState<ProjectStatus>(currentStatus);
  const [statusAt, setStatusAt] = useState(
    currentStatusAt || todayDateInputValue(),
  );
  const [state, formAction, pending] = useActionState(
    updateProjectStatusAction,
    initialState,
  );

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
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="statusAt" value={statusAt} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="status">{t("status")}</Label>
          <select
            id="status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as ProjectStatus)}
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
          <Label htmlFor="statusAt">{t("statusAt")}</Label>
          <Input
            id="statusAt"
            type="date"
            value={statusAt}
            onChange={(e) => setStatusAt(e.target.value)}
            required
          />
          <p className="text-xs text-muted-foreground">{t("statusAtHelp")}</p>
        </div>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={pending}>
        {pending ? t("savingStatus") : t("updateStatus")}
      </Button>
    </form>
  );
}
