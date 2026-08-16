"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  saveShareAnswersAction,
  submitShareQuestionnaireAction,
  type FormsActionState,
} from "@/app/actions/forms";
import {
  savePortalAnswersAction,
  submitPortalQuestionnaireAction,
} from "@/app/actions/portal-workspace";
import {
  ModularQuestionnaire,
  type QuestionnairePerson,
} from "@/components/forms/modular-questionnaire";
import type { ProjectFormLanguage } from "@/lib/ircc/form-language";

const initial: FormsActionState = {};

export function ClientFillForm({
  token,
  projectId,
  people,
  formLanguage,
  initialSubmittedAt,
}: {
  token?: string;
  projectId?: string;
  people: QuestionnairePerson[];
  formLanguage: ProjectFormLanguage;
  initialSubmittedAt?: string | null;
}) {
  const t = useTranslations("forms");
  const tp = useTranslations("projects");
  const portal = Boolean(projectId);
  const [saveState, saveAction, savePending] = useActionState(
    portal ? savePortalAnswersAction : saveShareAnswersAction,
    initial,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    portal ? submitPortalQuestionnaireAction : submitShareQuestionnaireAction,
    initial,
  );
  const [localPeople, setLocalPeople] = useState(people);
  const [submittedAt, setSubmittedAt] = useState<string | null>(
    initialSubmittedAt ?? null,
  );

  const answerLanguageLabel = tp(
    `formLanguages.${formLanguage === "fr" ? "fr" : "en"}`,
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
    if (projectId) fd.set("projectId", projectId);
    if (token) fd.set("token", token);
    fd.set("personId", personId);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(answers));
    return saveAction(fd);
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
    if (projectId) fd.set("projectId", projectId);
    if (token) fd.set("token", token);
    fd.set("personId", personId);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(answers));
    submitAction(fd);
  }

  const errorKey = submitState.error || saveState.error;

  const error =
    errorKey &&
    ({
      invalid: t("errors.invalid"),
      expired: t("errors.expired"),
      auth_required: t("shareAuth.errors.authRequired"),
      save_failed: t("errors.saveFailed"),
      incomplete: t("errors.incomplete"),
      submit_failed: t("errors.submitFailed"),
      granted: t("errors.granted"),
    }[errorKey] ??
      t("errors.generic"));

  const successMessage =
    !submitPending && submitState.message === "submitted"
      ? t("clientSubmitSuccess")
      : null;

  return (
    <div className="w-full space-y-6">
      {(submittedAt || successMessage) && (
        <div className="max-w-2xl space-y-2">
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
        </div>
      )}

      <div
        className="rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning-text"
        role="note"
      >
        {t("clientAnswerLanguage", { language: answerLanguageLabel })}
      </div>

      <p className="text-[15px] text-muted-foreground">{t("clientLede")}</p>

      <ModularQuestionnaire
        people={localPeople}
        onSave={handleSave}
        pending={savePending}
        errorMessage={error}
        mode="client"
        answerLocale={formLanguage}
        onSubmitQuestionnaire={handleSubmit}
        submitPending={submitPending}
        submittedAt={submittedAt}
      />
    </div>
  );
}
