"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  saveShareAnswersAction,
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
}: {
  token: string;
  people: QuestionnairePerson[];
  projectTitle: string;
  expiresAt: string;
}) {
  const t = useTranslations("forms");
  const [state, action, pending] = useActionState(
    saveShareAnswersAction,
    initial,
  );
  const [localPeople, setLocalPeople] = useState(people);

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
        people={localPeople}
        onSave={handleSave}
        pending={pending}
        statusMessage={state.message === "saved" ? t("saved") : null}
        errorMessage={error}
      />
    </div>
  );
}
