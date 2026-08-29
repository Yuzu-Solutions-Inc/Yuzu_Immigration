"use client";

import { useActionState, useMemo, useState, useTransition } from "react";
import { AlertCircle, Download, Eye, Loader2, Trash2 } from "lucide-react";
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
import { CustomIntakePanel } from "@/components/custom-forms/custom-intake-panel";
import { ProjectFormPdfViewer } from "@/components/forms/project-form-pdf-viewer";
import {
  qualityIssueKey,
  qualityIssueText,
} from "@/components/forms/quality-issue-text";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { StatusPill } from "@/components/ui/status-pill";
import { Link } from "@/i18n/navigation";
import {
  formTitle,
  isPersonScopedForm,
  type FormCode,
} from "@/lib/ircc/catalog";
import {
  analyzeAnswerQuality,
  qualityIssuesForFormCode,
  type QualityIssue,
} from "@/lib/ircc/data-quality";
import { applyDerivedAnswers } from "@/lib/ircc/fields";
import {
  formEditionAlertsForCodes,
  formatImmCode,
} from "@/lib/ircc/form-directory";
import { addableFormsForProgram } from "@/lib/ircc/kits";
import type { ProjectFormLanguage } from "@/lib/ircc/form-language";
import type { ProjectFormRow } from "@/lib/ircc/project-forms";
import type { ProgramFamily } from "@/db/schema";
import { emptyCustomAnswersStore, type CustomAnswersStore } from "@/lib/custom-forms/answers";
import type { ProjectCustomFormRow } from "@/lib/custom-forms/schema";
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

function FormAlertsSummary({
  people,
  editionAlerts,
}: {
  people: Array<{ id: string; displayName: string; issues: QualityIssue[] }>;
  editionAlerts: ReturnType<typeof formEditionAlertsForCodes>;
}) {
  const t = useTranslations("forms");
  const hasQuality = people.some((person) => person.issues.length > 0);
  if (!hasQuality && editionAlerts.length === 0) return null;

  return (
    <div className="space-y-3 border-t border-border px-5 py-4">
      {hasQuality ? (
        <div
          className="rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning-text"
          role="status"
        >
          <p className="flex items-start gap-2 font-semibold">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{t("quality.summaryTitle")}</span>
          </p>
          <p className="mt-1 text-xs text-warning-text/90">
            {t("quality.downloadLede")}
          </p>
          <ul className="mt-3 space-y-3">
            {people.map((person) =>
              person.issues.length === 0 ? null : (
                <li key={person.id}>
                  <p className="font-medium">{person.displayName}</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {person.issues.map((issue) => (
                      <li key={qualityIssueKey(issue, person.id)}>
                        {qualityIssueText(issue, t)}
                      </li>
                    ))}
                  </ul>
                </li>
              ),
            )}
          </ul>
        </div>
      ) : null}
      {editionAlerts.length > 0 ? (
        <div
          className="rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning-text"
          role="status"
        >
          <p className="flex items-start gap-2 font-semibold">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>{t("edition.title")}</span>
          </p>
          <p className="mt-1 text-xs text-warning-text/90">{t("edition.lede")}</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {editionAlerts.map((alert) => (
              <li key={alert.code}>
                {alert.newer && alert.livePublished
                  ? t("edition.newer", {
                      form: formatImmCode(alert.code),
                      date: alert.livePublished,
                    })
                  : alert.failed
                    ? t("edition.failed", { form: formatImmCode(alert.code) })
                    : t("edition.errors", { form: formatImmCode(alert.code) })}
                {alert.errors.length > 0 ? (
                  <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
                    {alert.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ProjectFormsPanel({
  locale,
  uiLocale,
  projectId,
  programFamily,
  forms,
  people,
  modificationBlocked = false,
  customForms = [],
  customCatalog = [],
  customStore,
}: {
  locale: "en" | "fr";
  uiLocale?: string;
  projectId: string;
  programFamily: ProgramFamily | string;
  forms: ProjectFormTodoRow[];
  people: QuestionnairePerson[];
  modificationBlocked?: boolean;
  customForms?: ProjectCustomFormRow[];
  customCatalog?: Array<{ id: string; title: string }>;
  customStore?: CustomAnswersStore;
}) {
  const t = useTranslations("forms");
  const tp = useTranslations("projects");
  const tr = useTranslations("roles");
  const tc = useTranslations("customForms");
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
  const [viewingFormId, setViewingFormId] = useState<string | null>(null);
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

  const principalPerson =
    people.find((person) => person.role === "principal") ?? people[0] ?? null;

  const qualityByPersonId = useMemo(() => {
    const map = new Map<string, QualityIssue[]>();
    for (const person of people) {
      map.set(
        person.id,
        analyzeAnswerQuality(applyDerivedAnswers(person.answers), {
          formCodes: person.formCodes,
        }),
      );
    }
    return map;
  }, [people]);

  const qualityPeople = useMemo(
    () =>
      people.map((person) => ({
        id: person.id,
        displayName: person.displayName,
        issues: qualityByPersonId.get(person.id) ?? [],
      })),
    [people, qualityByPersonId],
  );

  const issuesByFormId = useMemo(() => {
    const map = new Map<string, QualityIssue[]>();
    for (const form of forms) {
      const person = form.person_id
        ? peopleById.get(form.person_id)
        : principalPerson;
      if (!person) continue;
      const relevant = qualityIssuesForFormCode(
        qualityByPersonId.get(person.id) ?? [],
        form.form_code,
      );
      if (relevant.length > 0) map.set(form.id, relevant);
    }
    return map;
  }, [forms, peopleById, principalPerson, qualityByPersonId]);

  const editionAlerts = useMemo(
    () => formEditionAlertsForCodes(forms.map((form) => form.form_code)),
    [forms],
  );

  const addOptions = addable;

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

  const viewerItems = useMemo(
    () =>
      forms.map((form) => {
        const assignee = form.person_id
          ? peopleById.get(form.person_id)
          : null;
        return {
          id: form.id,
          title: formTitle(form.form_code as FormCode, locale),
          subtitle: assignee
            ? assignee.displayName
            : t("projectScoped"),
        };
      }),
    [forms, peopleById, locale, t],
  );

  const showCustom =
    customForms.length > 0 || customCatalog.length > 0;
  const showIrcc = forms.length > 0 || !showCustom;
  const labelLocale = uiLocale ?? locale;

  const customPanel = showCustom ? (
    <SurfaceCard className="space-y-4">
      <CustomIntakePanel
        locale={labelLocale}
        projectId={projectId}
        forms={customForms}
        catalog={customCatalog}
        people={people.map((person) => ({
          id: person.id,
          displayName: person.displayName,
        }))}
        store={customStore ?? emptyCustomAnswersStore()}
        modificationBlocked={modificationBlocked}
        mode="staff"
      />
    </SurfaceCard>
  ) : null;

  return (
    <div className="space-y-6">
    {showIrcc ? (
    <SurfaceCard className="space-y-0 overflow-hidden p-0 sm:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {showCustom ? tc("irccGroup") : t("todoTitle")}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {forms.length > 0 ? (
          <Link
            href={`/projects/${projectId}/forms`}
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-action text-action-foreground hover:bg-action/90",
            )}
          >
            {t("openQuestionnaire")}
          </Link>
          ) : null}
          {forms.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={genPending || forms.length === 0}
            onClick={() => handleDownload()}
          >
            {downloadingKey === "all" ? t("downloading") : t("downloadAll")}
          </Button>
          ) : null}
        </div>
      </div>
      <FormAlertsSummary
        people={qualityPeople}
        editionAlerts={editionAlerts}
      />
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
              const flagged =
                (issuesByFormId.get(form.id)?.length ?? 0) > 0 ||
                editionAlerts.some(
                  (alert) => alert.code === form.form_code.toLowerCase(),
                );
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
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100 lg:has-[[data-downloading]]:opacity-100 lg:has-[[data-viewing]]:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        data-viewing={
                          viewingFormId === form.id ? "" : undefined
                        }
                        onClick={() => setViewingFormId(form.id)}
                        aria-label={t("view")}
                        title={t("view")}
                      >
                        <Eye className="size-4" />
                      </Button>
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
                    {flagged ? (
                      <StatusPill
                        label={t("quality.sectionHasFlags")}
                        tone="warning"
                      />
                    ) : ready ? (
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
                className="min-w-0 w-full flex-1 sm:min-w-[140px]"
              >
                {addOptions.map((code) => (
                  <option key={code} value={code}>
                    {code.toUpperCase()} · {formTitle(code, locale)}
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
                  className="min-w-0 w-full sm:min-w-[160px] sm:w-auto"
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
      <ProjectFormPdfViewer
        open={Boolean(viewingFormId)}
        onOpenChange={(next) => {
          if (!next) setViewingFormId(null);
        }}
        items={viewerItems}
        startFormId={viewingFormId}
        projectId={projectId}
      />
    </SurfaceCard>
    ) : null}
    {customPanel}
    </div>
  );
}

export function ProjectQuestionnaire({
  locale,
  uiLocale,
  projectId,
  people,
  formLanguage,
  modificationBlocked = false,
  customForms = [],
  customStore,
}: {
  locale: "en" | "fr";
  uiLocale?: string;
  projectId: string;
  people: QuestionnairePerson[];
  formLanguage: ProjectFormLanguage;
  modificationBlocked?: boolean;
  customForms?: ProjectCustomFormRow[];
  customStore?: CustomAnswersStore;
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

  const hasIrcc = people.some((person) => person.formCodes.length > 0);

  return (
    <div className="space-y-6">
      {hasIrcc ? (
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
      ) : null}
      {customForms.length > 0 ? (
        <SurfaceCard className="space-y-4">
          <CustomIntakePanel
            locale={uiLocale ?? locale}
            projectId={projectId}
            forms={customForms}
            people={people.map((person) => ({
              id: person.id,
              displayName: person.displayName,
            }))}
            store={customStore ?? emptyCustomAnswersStore()}
            modificationBlocked={modificationBlocked}
            mode="staff"
          />
        </SurfaceCard>
      ) : null}
    </div>
  );
}
