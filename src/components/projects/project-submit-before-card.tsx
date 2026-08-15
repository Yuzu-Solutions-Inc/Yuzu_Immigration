"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateProjectSubmitBeforeAction,
  type SubmitBeforeUpdateState,
} from "@/app/actions/projects";
import { StatusPill } from "@/components/ui/status-pill";

const initialState: SubmitBeforeUpdateState = {};

function formatSubmitBefore(isoDate: string, locale: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString(
    locale === "fr" ? "fr-CA" : locale === "es" ? "es-ES" : "en-CA",
    { year: "numeric", month: "short", day: "numeric" },
  );
}

export function ProjectSubmitBeforeCard({
  locale,
  projectId,
  currentSubmitBefore,
}: {
  locale: string;
  projectId: string;
  currentSubmitBefore: string | null;
}) {
  const t = useTranslations("projects");
  const [value, setValue] = useState(currentSubmitBefore ?? "");
  const [state, formAction, pending] = useActionState(
    updateProjectSubmitBeforeAction,
    initialState,
  );

  useEffect(() => {
    setValue(currentSubmitBefore ?? "");
  }, [currentSubmitBefore]);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        update_failed: t("errors.updateFailed"),
        not_found: t("errors.notFound"),
      }[state.error] ?? t("errors.generic")
    : null;

  const dateLabel = value
    ? formatSubmitBefore(value, locale)
    : t("submitBeforeEmpty");
  const pillLabel = `${t("submitBefore")} · ${dateLabel}`;

  return (
    <form action={formAction} className="inline-flex flex-col gap-1">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="projectId" value={projectId} />
      <div className="group relative inline-flex max-w-full items-center rounded-full focus-within:ring-3 focus-within:ring-ring/30">
        <StatusPill
          label={pillLabel}
          tone="muted"
          className="max-w-full gap-1.5 pr-7 group-hover:ring-2 group-hover:ring-action/20 group-focus-within:ring-2 group-focus-within:ring-action/20"
        />
        <Pencil
          className="pointer-events-none absolute right-2.5 size-3 shrink-0 text-current opacity-50 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
          aria-hidden
        />
        <input
          id="submit-before-card"
          type="date"
          name="submitBefore"
          value={value}
          disabled={pending}
          aria-label={t("editSubmitBeforeAria")}
          title={t("submitBefore")}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            if (next === (currentSubmitBefore ?? "")) return;
            event.currentTarget.form?.requestSubmit();
          }}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-wait [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
      </div>
      {errorMessage ? (
        <p className="text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
