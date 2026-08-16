"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { Download, Loader2, Trash2 } from "lucide-react";
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
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusPill } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
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
import type { ProjectFormLanguage } from "@/lib/ircc/form-language";
import type { ProjectFormRow } from "@/lib/ircc/project-forms";
import type { ProgramFamily } from "@/db/schema";
import { cn } from "@/lib/utils";

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
  modificationBlocked = false,
}: {
  locale: "en" | "fr";
  projectId: string;
  programFamily: ProgramFamily | string;
  forms: ProjectFormTodoRow[];
  people: QuestionnairePerson[];
  modificationBlocked?: boolean;
}) {
  const t = useTranslations("forms");
  const tp = useTranslations("projects");
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
    <SurfaceCard className="space-y-0 overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("todoTitle")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/projects/${projectId}/forms`}
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-action text-action-foreground hover:bg-action/90",
            )}
          >
            {t("openQuestionnaire")}
          </Link>
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
      </div>
      {modificationBlocked ? (
        <p className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
          {tp("grantedLock")}
        </p>
      ) : null}
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
                      {!modificationBlocked ? (
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
                      ) : null}
                    </div>
                    {ready ? (
                      <StatusPill
                        label={t("pills.completed")}
                        tone="success"
                      />
                    ) : (
                      <StatusPill
                        label={t("pills.inProgress")}
                        tone="action"
                      />
                    )}
                  </div>
                </li>
              );
            })
          )}
          {!modificationBlocked ? (
          <li className="px-5 py-3">
            <form action={addAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="locale" value={locale} />
              <NativeSelect
                name="formCode"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value as FormCode)}
                aria-label={t("addForm")}
                className="min-w-[140px] flex-1"
              >
                {addOptions.map((code) => (
                  <option key={code} value={code}>
                    {formTitle(code, locale)}
                    {isPersonScopedForm(code)
                      ? ` · ${t("scopePerson")}`
                      : ` · ${t("scopeProject")}`}
                  </option>
                ))}
              </NativeSelect>
              {personScoped && people.length > 1 ? (
                <NativeSelect
                  name="personId"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  aria-label={t("assignPerson")}
                  className="min-w-[160px]"
                >
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.displayName} · {tr(person.role as never)}
                    </option>
                  ))}
                </NativeSelect>
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
                  : addState.error === "granted"
                    ? t("errors.granted")
                    : t("errors.addFailed")}
              </p>
            ) : null}
            {removeState.error ? (
              <p className="mt-2 text-sm text-destructive">
                {removeState.error === "granted"
                  ? t("errors.granted")
                  : t("errors.removeFailed")}
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
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warning-text">
                {genWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            ) : null}
          </li>
          ) : null}
        </ul>
      </SurfaceCard>
  );
}

export function ProjectQuestionnaire({
  locale,
  projectId,
  people,
  formLanguage,
  modificationBlocked = false,
}: {
  locale: "en" | "fr";
  projectId: string;
  people: QuestionnairePerson[];
  formLanguage: ProjectFormLanguage;
  modificationBlocked?: boolean;
}) {
  const t = useTranslations("forms");
  const tp = useTranslations("projects");
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
    return saveAction(fd);
  }

  const saveError =
    saveState.error &&
    ({
      invalid: t("errors.invalid"),
      unauthorized: t("errors.unauthorized"),
      save_failed: t("errors.saveFailed"),
      granted: t("errors.granted"),
    }[saveState.error] ??
      t("errors.generic"));

  const answerLanguageLabel = tp(
    `formLanguages.${formLanguage === "fr" ? "fr" : "en"}`,
  );

  return (
    <SurfaceCard className="space-y-4">
      {modificationBlocked ? (
        <p className="text-sm text-muted-foreground">{tp("grantedLock")}</p>
      ) : null}
      <div
        className="rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning-text"
        role="note"
      >
        {t("clientAnswerLanguage", { language: answerLanguageLabel })}
      </div>
      <ModularQuestionnaire
        people={people}
        onSave={handleSave}
        pending={savePending}
        errorMessage={saveError}
        answerLocale={formLanguage}
        readOnly={modificationBlocked}
      />
    </SurfaceCard>
  );
}
