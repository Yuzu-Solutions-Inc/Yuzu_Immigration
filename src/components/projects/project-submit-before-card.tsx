"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateProjectSubmitBeforeAction,
  type SubmitBeforeUpdateState,
} from "@/app/actions/projects";

const initialState: SubmitBeforeUpdateState = {};

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
    <div className="text-right text-sm">
      <form action={formAction} className="flex items-center justify-end gap-2">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="projectId" value={projectId} />
        <label
          htmlFor="submit-before-card"
          className="text-muted-foreground"
        >
          {t("submitBefore")}
        </label>
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
          className="h-7 w-[9.5rem] cursor-pointer border-0 bg-transparent p-0 text-right text-sm font-medium text-brand outline-none disabled:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
        {!value ? (
          <span className="sr-only">{t("submitBeforeEmpty")}</span>
        ) : null}
      </form>
      {errorMessage ? (
        <p className="mt-1 text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
