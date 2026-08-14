"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  saveShareAnswersAction,
  submitShareQuestionnaireAction,
  type FormsActionState,
} from "@/app/actions/forms";
import {
  ModularQuestionnaire,
  type QuestionnairePerson,
} from "@/components/forms/modular-questionnaire";

const initial: FormsActionState = {};

export function ClientFillForm({
  token,
  people,
  projectTitle,
  expiresAt,
  initialSubmittedAt,
}: {
  token: string;
  people: QuestionnairePerson[];
  projectTitle: string;
  expiresAt: string;
  initialSubmittedAt?: string | null;
}) {
  const t = useTranslations("forms");
  const [saveState, saveAction, savePending] = useActionState(
    saveShareAnswersAction,
    initial,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    submitShareQuestionnaireAction,
    initial,
  );
  const [localPeople, setLocalPeople] = useState(people);
  const [submittedAt, setSubmittedAt] = useState<string | null>(
    initialSubmittedAt ?? null,
  );

  useEffect(() => {
    if (submitState.message === "submitted" && submitState.submittedAt) {
      setSubmittedAt(submitState.submittedAt);
    }
  }, [submitState.message, submitState.submittedAt]);

  function handleSave(
    personId: string,
    answers: Record<string, unknown>,
    section: string,
  ) {
    setLocalPeople((prev) =>
      prev.map((p) => (p.id === personId ? { ...p, answers } : p)),
    );
    const fd = new FormData();
    fd.set("token", token);
    fd.set("personId", personId);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(answers));
    saveAction(fd);
  }

  function handleSubmit(
    personId: string,
    answers: Record<string, unknown>,
    section: string,
  ) {
    setLocalPeople((prev) =>
      prev.map((p) => (p.id === personId ? { ...p, answers } : p)),
    );
    const fd = new FormData();
    fd.set("token", token);
    fd.set("personId", personId);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(answers));
    submitAction(fd);
  }

  const errorKey = submitPending
    ? submitState.error
    : savePending
      ? saveState.error
      : submitState.error || saveState.error;

  const error =
    errorKey &&
    ({
      invalid: t("errors.invalid"),
      expired: t("errors.expired"),
      save_failed: t("errors.saveFailed"),
      incomplete: t("errors.incomplete"),
      submit_failed: t("errors.submitFailed"),
    }[errorKey] ??
      t("errors.generic"));

  const successMessage =
    !submitPending && submitState.message === "submitted"
      ? t("clientSubmitSuccess")
      : null;

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="max-w-2xl space-y-2">
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
        {submittedAt ? (
          <p className="text-sm font-medium text-success" role="status">
            {t("clientAlreadySubmitted", {
              date: new Date(submittedAt).toLocaleString(),
            })}
          </p>
        ) : null}
        {successMessage ? (
          <p className="text-sm font-medium text-success" role="status">
            {successMessage}
          </p>
        ) : null}
      </header>

      <ModularQuestionnaire
        people={localPeople}
        onSave={handleSave}
        pending={savePending}
        errorMessage={error}
        mode="client"
        onSubmitQuestionnaire={handleSubmit}
        submitPending={submitPending}
        submittedAt={submittedAt}
      />
    </div>
  );
}
