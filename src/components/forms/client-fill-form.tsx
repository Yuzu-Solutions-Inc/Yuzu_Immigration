"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  saveShareAnswersAction,
  type FormsActionState,
} from "@/app/actions/forms";
import { ModularQuestionnaire } from "@/components/forms/modular-questionnaire";

const initial: FormsActionState = {};

export function ClientFillForm({
  token,
  formCodes,
  initialAnswers,
  projectTitle,
  expiresAt,
}: {
  token: string;
  formCodes: string[];
  initialAnswers: Record<string, unknown>;
  projectTitle: string;
  expiresAt: string;
}) {
  const t = useTranslations("forms");
  const [state, action, pending] = useActionState(
    saveShareAnswersAction,
    initial,
  );
  const [localAnswers, setLocalAnswers] = useState(initialAnswers);

  function handleSave(answers: Record<string, unknown>, section: string) {
    setLocalAnswers(answers);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(answers));
    action(fd);
  }

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      expired: t("errors.expired"),
      save_failed: t("errors.saveFailed"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("clientEyebrow")}
        </p>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {projectTitle}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("clientLede")}</p>
        <p className="text-sm text-muted-foreground">
          {t("clientExpires", {
            date: new Date(expiresAt).toLocaleDateString(),
          })}
        </p>
      </header>

      <ModularQuestionnaire
        formCodes={formCodes}
        initialAnswers={localAnswers}
        onSave={handleSave}
        pending={pending}
        statusMessage={state.message === "saved" ? t("saved") : null}
        errorMessage={error}
      />
    </div>
  );
}
