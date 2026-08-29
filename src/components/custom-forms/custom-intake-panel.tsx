"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  addCustomFormToProjectAction,
  removeCustomFormFromProjectAction,
  savePortalCustomAnswersAction,
  saveProjectCustomAnswersAction,
  submitPortalCustomQuestionnaireAction,
  type CustomFormActionState,
} from "@/app/actions/custom-forms";
import { CustomQuestionnaire } from "@/components/custom-forms/custom-questionnaire";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusPill } from "@/components/ui/status-pill";
import {
  answersForCustomFill,
  type CustomAnswersStore,
} from "@/lib/custom-forms/answers";
import { customSchemaFillCounts } from "@/lib/custom-forms/completeness";
import type { ProjectCustomFormRow } from "@/lib/custom-forms/schema";

const initial: CustomFormActionState = {};

function statusTone(
  status: ProjectCustomFormRow["status"],
): "muted" | "action" | "success" {
  if (status === "ready") return "success";
  if (status === "in_progress" || status === "generated") return "action";
  return "muted";
}

export function CustomIntakePanel({
  locale,
  projectId,
  forms,
  catalog = [],
  people,
  store,
  submittedAt = null,
  modificationBlocked = false,
  mode = "staff",
  fillPersonId = null,
}: {
  locale: string;
  projectId: string;
  forms: ProjectCustomFormRow[];
  catalog?: Array<{ id: string; title: string }>;
  people: Array<{ id: string; displayName: string }>;
  store: CustomAnswersStore;
  submittedAt?: string | null;
  modificationBlocked?: boolean;
  mode?: "staff" | "client";
  fillPersonId?: string | null;
}) {
  const t = useTranslations("customForms");
  const tf = useTranslations("forms");
  const [addState, addAction, addPending] = useActionState(
    addCustomFormToProjectAction,
    initial,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeCustomFormFromProjectAction,
    initial,
  );
  const saveAction =
    mode === "client"
      ? savePortalCustomAnswersAction
      : saveProjectCustomAnswersAction;
  const [saveState, persist, savePending] = useActionState(saveAction, initial);
  const [submitState, submitAction, submitPending] = useActionState(
    submitPortalCustomQuestionnaireAction,
    initial,
  );

  const visible = useMemo(
    () =>
      fillPersonId
        ? forms.filter(
            (form) =>
              form.scope === "project" || form.person_id === fillPersonId,
          )
        : forms,
    [forms, fillPersonId],
  );

  const attachedIds = useMemo(
    () => new Set(forms.map((form) => form.template_id).filter(Boolean)),
    [forms],
  );
  const addable = catalog.filter((row) => !attachedIds.has(row.id));

  const [selectedId, setSelectedId] = useState(visible[0]?.id ?? "");
  const selected =
    visible.find((form) => form.id === selectedId) ?? visible[0] ?? null;

  const peopleById = useMemo(() => {
    const map = new Map(people.map((person) => [person.id, person]));
    return map;
  }, [people]);

  const errorKey =
    submitState.error || saveState.error || addState.error || removeState.error;
  const error =
    errorKey &&
    ({
      invalid: t("errors.invalid"),
      unauthorized: t("errors.unauthorized"),
      forbidden: t("errors.forbidden"),
      save_failed: t("errors.save_failed"),
      not_found: t("errors.not_found"),
      granted: t("errors.granted"),
      trial_expired: t("errors.trial_expired"),
    }[errorKey] ??
      tf("errors.generic"));

  const submitted =
    submitState.submittedAt || submittedAt || submitState.message === "submitted";

  if (visible.length === 0 && addable.length === 0 && catalog.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("projectGroup")}
        </h2>
        {submitted ? (
          <p className="text-sm font-medium text-success">{t("submitted")}</p>
        ) : null}
      </div>

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {visible.length === 0 ? (
          <li className="px-5 py-3 text-sm text-muted-foreground">
            {t("noCatalog")}
          </li>
        ) : (
          visible.map((form) => {
            const assignee = form.person_id
              ? peopleById.get(form.person_id)
              : null;
            const bag = answersForCustomFill(store, form.person_id);
            const counts = customSchemaFillCounts(form.schema, bag);
            return (
              <li key={form.id} className="flex flex-wrap items-center gap-2 px-5 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelectedId(form.id)}
                >
                  <p className="font-medium text-brand">{form.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {form.scope === "project"
                      ? t("scopeProject")
                      : assignee?.displayName ?? t("scopePerson")}
                    {counts.total > 0
                      ? ` · ${counts.percent}%`
                      : null}
                  </p>
                </button>
                <StatusPill
                  label={
                    form.status === "ready"
                      ? tf("statuses.ready")
                      : form.status === "in_progress"
                        ? tf("statuses.in_progress")
                        : tf("statuses.todo")
                  }
                  tone={statusTone(form.status)}
                />
                {mode === "staff" && !modificationBlocked ? (
                  <form action={removeAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="formId" value={form.id} />
                    <input type="hidden" name="locale" value={locale} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="sm"
                      disabled={removePending}
                    >
                      {t("removeFromProject")}
                    </Button>
                  </form>
                ) : null}
              </li>
            );
          })
        )}
        {mode === "staff" && !modificationBlocked && addable.length > 0 ? (
          <li className="px-5 py-3">
            <form action={addAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="locale" value={locale} />
              <NativeSelect
                name="templateId"
                aria-label={t("addToProject")}
                className="min-w-[160px] flex-1"
                defaultValue={addable[0]?.id}
              >
                {addable.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </NativeSelect>
              <NativeSelect name="scope" className="w-auto" defaultValue="person">
                <option value="person">{t("scopePerson")}</option>
                <option value="project">{t("scopeProject")}</option>
              </NativeSelect>
              <Button type="submit" disabled={addPending}>
                {addPending ? t("adding") : t("addToProject")}
              </Button>
            </form>
          </li>
        ) : null}
      </ul>

      {selected ? (
        <CustomFormFill
          key={selected.id}
          form={selected}
          locale={locale}
          initialAnswers={answersForCustomFill(store, selected.person_id)}
          pending={savePending || submitPending}
          errorMessage={error}
          readOnly={modificationBlocked}
          mode={mode}
          submitPending={submitPending}
          onSave={(next, section) => {
            const fd = new FormData();
            fd.set("projectId", projectId);
            fd.set("personId", selected.person_id ?? fillPersonId ?? "");
            fd.set("locale", locale);
            fd.set("currentSection", section);
            fd.set("answers", JSON.stringify(next));
            return persist(fd);
          }}
          onSubmit={(next, section) => {
            const fd = new FormData();
            fd.set("projectId", projectId);
            fd.set("personId", selected.person_id ?? fillPersonId ?? "");
            fd.set("locale", locale);
            fd.set("currentSection", section);
            fd.set("answers", JSON.stringify(next));
            submitAction(fd);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomFormFill({
  form,
  locale,
  initialAnswers,
  pending,
  errorMessage,
  readOnly,
  mode,
  submitPending,
  onSave,
  onSubmit,
}: {
  form: ProjectCustomFormRow;
  locale: string;
  initialAnswers: Record<string, unknown>;
  pending?: boolean;
  errorMessage?: string | null;
  readOnly?: boolean;
  mode: "staff" | "client";
  submitPending?: boolean;
  onSave: (answers: Record<string, unknown>, section: string) => void;
  onSubmit: (answers: Record<string, unknown>, section: string) => void;
}) {
  const t = useTranslations("customForms");
  const [answers, setAnswers] = useState(initialAnswers);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t("clientLede")}</p>
      <CustomQuestionnaire
        schema={form.schema}
        answers={answers}
        onChange={setAnswers}
        onSave={onSave}
        pending={pending}
        errorMessage={errorMessage}
        locale={locale}
        readOnly={readOnly}
      />
      {mode === "client" && !readOnly ? (
        <Button
          type="button"
          disabled={submitPending}
          onClick={() =>
            onSubmit(answers, form.schema.sections[0]?.key ?? "")
          }
        >
          {submitPending ? t("saving") : t("submit")}
        </Button>
      ) : null}
    </div>
  );
}
