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
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-elevated">
      <form action={formAction}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="projectId" value={projectId} />
        <label
          htmlFor="submit-before-card"
          className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
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
          className="mt-0.5 block h-7 w-full min-w-0 cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold text-brand outline-none disabled:opacity-60 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
        />
        {!value ? (
          <p className="sr-only">{t("submitBeforeEmpty")}</p>
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
