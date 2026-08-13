"use client";

import { Pencil } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateProjectSubmitBeforeAction,
  type SubmitBeforeUpdateState,
} from "@/app/actions/projects";
import { cn } from "@/lib/utils";

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

  return (
    <form
      action={formAction}
      className="col-span-3 grid grid-cols-subgrid items-center gap-y-1"
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="projectId" value={projectId} />
      <label
        htmlFor="submit-before-card"
        className="justify-self-end text-sm text-muted-foreground"
      >
        {t("submitBefore")}
      </label>
      <div className="group relative justify-self-start rounded-md focus-within:ring-3 focus-within:ring-ring/30">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm underline decoration-dotted decoration-border underline-offset-4 group-hover:text-action group-hover:decoration-action group-focus-within:text-action group-focus-within:decoration-action",
            value ? "font-medium text-brand" : "text-muted-foreground",
          )}
        >
          {value ? formatSubmitBefore(value, locale) : t("submitBeforeEmpty")}
          <Pencil
            className="size-3 shrink-0 text-muted-foreground group-hover:text-action"
            aria-hidden
          />
        </span>
        <input
          id="submit-before-card"
          type="date"
          name="submitBefore"
          value={value}
          disabled={pending}
          aria-label={t("editSubmitBeforeAria")}
          onChange={(event) => {
            const next = event.target.value;
            setValue(next);
            if (next === (currentSubmitBefore ?? "")) return;
            event.currentTarget.form?.requestSubmit();
          }}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-wait [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 [&::-webkit-calendar-picker-indicator]:h-full [&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
      </div>
      <span aria-hidden className="size-7" />
      {errorMessage ? (
        <p className="col-span-3 text-right text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </form>
  );
}
