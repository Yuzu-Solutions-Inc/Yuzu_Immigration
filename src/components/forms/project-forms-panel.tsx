"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Circle, CircleCheck, Download, Loader2, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addFormToProjectAction,
  generateProjectPdfsAction,
  removeFormFromProjectAction,
  saveProjectAnswersAction,
  type FormsActionState,
} from "@/app/actions/forms";
import {
  ModularQuestionnaire,
  type QuestionnairePerson,
} from "@/components/forms/modular-questionnaire";
import { ProjectShareLinkCard } from "@/components/forms/project-share-link-card";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import {
  formTitle,
  isPersonScopedForm,
  type FormCode,
  ALL_FORM_CODES,
} from "@/lib/ircc/catalog";
import {
  addableFormsForProgram,
  isCustomProgram,
  isFederalPermitProgram,
} from "@/lib/ircc/kits";
import type { ProjectFormRow } from "@/lib/ircc/project-forms";
import type { ProgramFamily } from "@/db/schema";

const initialState: FormsActionState = {};

function triggerBrowserDownload(
  base64: string,
  filename: string,
  contentType: string,
) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: contentType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ProjectFormTodoRow = ProjectFormRow & {
  mandatoryReady: boolean;
};

export function ProjectFormsPanel({
  locale,
  projectId,
  programFamily,
  forms,
  people,
  activeShareExpiresAt,
  shareCanReveal,
}: {
  locale: "en" | "fr";
  projectId: string;
  programFamily: ProgramFamily | string;
  forms: ProjectFormTodoRow[];
  people: QuestionnairePerson[];
  activeShareExpiresAt: string | null;
  shareCanReveal: boolean;
}) {
  const t = useTranslations("forms");
  const tr = useTranslations("roles");
  const [addState, addAction, addPending] = useActionState(
    addFormToProjectAction,
    initialState,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeFormFromProjectAction,
    initialState,
  );
  const [genPending, startGen] = useTransition();
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const addable = addableFormsForProgram(programFamily);
  const [formCode, setFormCode] = useState<FormCode>(addable[0] ?? "imm5475");
  const personScoped = isPersonScopedForm(formCode);
  const [personId, setPersonId] = useState(people[0]?.id ?? "");

  const peopleById = useMemo(() => {
    const map = new Map(people.map((p) => [p.id, p]));
    return map;
  }, [people]);

  const addOptions =
    isFederalPermitProgram(programFamily) || isCustomProgram(programFamily)
      ? addable
      : [
          ...addable,
          ...ALL_FORM_CODES.filter((c) => !addable.includes(c)),
        ];

  function handleDownload(formId?: string) {
    const key = formId ?? "all";
    setGenError(null);
    setGenWarnings([]);
    setDownloadingKey(key);
    startGen(async () => {
      try {
        const result = await generateProjectPdfsAction(
          projectId,
          locale,
          formId,
        );
        if (!result.ok) {
          setGenError(result.error);
          return;
        }
        setGenWarnings(result.warnings);
        triggerBrowserDownload(
          result.base64,
          result.filename,
          result.contentType,
        );
      } finally {
        setDownloadingKey(null);
      }
    });
  }

  return (
    <div className="space-y-6">
      <ProjectShareLinkCard
        locale={locale}
        projectId={projectId}
        activeShareExpiresAt={activeShareExpiresAt}
        canReveal={shareCanReveal}
      />

      <SurfaceCard className="space-y-0 overflow-hidden p-0 sm:p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("todoTitle")}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={genPending || forms.length === 0}
            onClick={() => handleDownload()}
          >
            {downloadingKey === "all" ? t("downloading") : t("downloadAll")}
          </Button>
        </div>
        <ul className="divide-y divide-border border-t border-border">
          {forms.length === 0 ? (
            <li className="px-5 py-3 text-sm text-muted-foreground">
              {t("todoEmpty")}
            </li>
          ) : (
            forms.map((form) => {
              const assignee = form.person_id
                ? peopleById.get(form.person_id)
                : null;
              const ready = form.mandatoryReady;
              const downloading = downloadingKey === form.id;
              return (
                <li key={form.id} className="group px-5 py-3">
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-brand">
                        {formTitle(form.form_code as FormCode, locale)}
                      </p>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                        {form.form_code.toUpperCase()}
                        {assignee
                          ? ` · ${assignee.displayName}`
                          : ` · ${t("projectScoped")}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 lg:has-[[data-downloading]]:opacity-100">
                      {ready ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          disabled={genPending}
                          data-downloading={downloading ? "" : undefined}
                          onClick={() => handleDownload(form.id)}
                          aria-label={
                            downloading ? t("downloading") : t("download")
                          }
                          title={t("download")}
                        >
                          {downloading ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Download className="size-4" />
                          )}
                        </Button>
                      ) : null}
                      <form
                        action={removeAction}
                        className="flex shrink-0"
                        onSubmit={(event) => {
                          if (
                            !window.confirm(
                              t("removeConfirm", {
                                name: formTitle(
                                  form.form_code as FormCode,
                                  locale,
                                ),
                              }),
                            )
                          ) {
                            event.preventDefault();
                          }
                        }}
                      >
                        <input type="hidden" name="projectId" value={projectId} />
                        <input type="hidden" name="formId" value={form.id} />
                        <input type="hidden" name="locale" value={locale} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon-xs"
                          disabled={removePending}
                          aria-label={t("remove")}
                          title={t("remove")}
                          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </form>
                    </div>
                    {ready ? (
                      <CircleCheck
                        className="size-4 shrink-0 text-emerald-600"
                        aria-label={t("statuses.ready")}
                      />
                    ) : (
                      <Circle
                        className="size-4 shrink-0 text-gray-300"
                        aria-label={t("statuses.todo")}
                      />
                    )}
                  </div>
                </li>
              );
            })
          )}
          <li className="px-5 py-3">
            <form action={addAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="locale" value={locale} />
              <select
                name="formCode"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value as FormCode)}
                aria-label={t("addForm")}
                className="h-10 min-w-[140px] flex-1 rounded-xl border border-input bg-surface px-3 text-sm"
              >
                {addOptions.map((code) => (
                  <option key={code} value={code}>
                    {formTitle(code, locale)}
                    {isPersonScopedForm(code)
                      ? ` · ${t("scopePerson")}`
                      : ` · ${t("scopeProject")}`}
                  </option>
                ))}
              </select>
              {personScoped && people.length > 1 ? (
                <select
                  name="personId"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  aria-label={t("assignPerson")}
                  className="h-10 min-w-[160px] rounded-xl border border-input bg-surface px-3 text-sm"
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName} · {tr(person.role as never)}
                    </option>
                  ))}
                </select>
              ) : personScoped ? (
                <input type="hidden" name="personId" value={personId} />
              ) : null}
              <Button
                type="submit"
                disabled={addPending || (personScoped && !personId)}
              >
                {addPending ? t("adding") : t("addForm")}
              </Button>
            </form>
            {addState.error ? (
              <p className="mt-2 text-sm text-destructive">
                {addState.error === "person_required"
                  ? t("errors.personRequired")
                  : t("errors.addFailed")}
              </p>
            ) : null}
            {removeState.error ? (
              <p className="mt-2 text-sm text-destructive">
                {t("errors.removeFailed")}
              </p>
            ) : null}
            {genError ? (
              <p className="mt-2 text-sm text-destructive" role="alert">
                {genError.startsWith("Enter") ||
                genError.startsWith("Could") ||
                genError.includes(":")
                  ? genError
                  : t("errors.generateFailed")}
              </p>
            ) : null}
            {genWarnings.length > 0 ? (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-700">
                {genWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </li>
        </ul>
      </SurfaceCard>
    </div>
  );
}

export function ProjectQuestionnaire({
  locale,
  projectId,
  people,
}: {
  locale: "en" | "fr";
  projectId: string;
  people: QuestionnairePerson[];
}) {
  const t = useTranslations("forms");
  const [saveState, saveAction, savePending] = useActionState(
    saveProjectAnswersAction,
    initialState,
  );

  function handleSave(
    nextPersonId: string,
    next: Record<string, unknown>,
    section: string,
  ) {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("personId", nextPersonId);
    fd.set("locale", locale);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(next));
    saveAction(fd);
  }

  const saveError =
    saveState.error &&
    ({
      invalid: t("errors.invalid"),
      unauthorized: t("errors.unauthorized"),
      save_failed: t("errors.saveFailed"),
    }[saveState.error] ??
      t("errors.generic"));

  return (
    <SurfaceCard>
      <ModularQuestionnaire
        people={people}
        onSave={handleSave}
        pending={savePending}
        errorMessage={saveError}
      />
    </SurfaceCard>
  );
}
