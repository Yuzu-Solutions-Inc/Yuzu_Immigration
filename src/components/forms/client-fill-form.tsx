"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { type FormsActionState } from "@/app/actions/forms";
import {
  savePortalAnswersAction,
  submitPortalQuestionnaireAction,
} from "@/app/actions/portal-workspace";
import {
  ModularQuestionnaire,
  type QuestionnairePerson,
} from "@/components/forms/modular-questionnaire";
import { CustomIntakePanel } from "@/components/custom-forms/custom-intake-panel";
import { emptyCustomAnswersStore, type CustomAnswersStore } from "@/lib/custom-forms/answers";
import type { ProjectCustomFormRow } from "@/lib/custom-forms/schema";
import type { ProjectFormLanguage } from "@/lib/ircc/form-language";

const initial: FormsActionState = {};

export function ClientFillForm({
  projectId,
  people,
  formLanguage,
  initialSubmittedAt,
  customForms = [],
  customStore,
  customSubmittedAt = null,
  fillPersonId = null,
  uiLocale,
}: {
  projectId: string;
  people: QuestionnairePerson[];
  formLanguage: ProjectFormLanguage;
  initialSubmittedAt?: string | null;
  customForms?: ProjectCustomFormRow[];
  customStore?: CustomAnswersStore;
  customSubmittedAt?: string | null;
  fillPersonId?: string | null;
  uiLocale?: string;
}) {
  const t = useTranslations("forms");
  const tp = useTranslations("projects");
  const [saveState, saveAction, savePending] = useActionState(
    savePortalAnswersAction,
    initial,
  );
  const [submitState, submitAction, submitPending] = useActionState(
    submitPortalQuestionnaireAction,
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
    fd.set("projectId", projectId);
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
    fd.set("projectId", projectId);
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
      auth_required: t("errors.auth_required"),
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

  const hasIrcc = localPeople.some((person) => person.formCodes.length > 0);

  return (
    <div className="w-full space-y-6">
      {hasIrcc ? (
        <>
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
        </>
      ) : null}

      {customForms.length > 0 ? (
        <CustomIntakePanel
          locale={uiLocale ?? formLanguage}
          projectId={projectId}
          forms={customForms}
          people={localPeople.map((person) => ({
            id: person.id,
            displayName: person.displayName,
          }))}
          store={customStore ?? emptyCustomAnswersStore()}
          submittedAt={customSubmittedAt}
          mode="client"
          fillPersonId={fillPersonId}
        />
      ) : null}
    </div>
  );
}
