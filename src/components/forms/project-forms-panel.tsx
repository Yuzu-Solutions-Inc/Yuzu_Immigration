"use client";

import { useActionState, useState, useTransition } from "react";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  addFormToProjectAction,
  createFormShareLinkAction,
  generateProjectPdfsAction,
  revokeFormShareLinkAction,
  saveProjectAnswersAction,
  type FormsActionState,
} from "@/app/actions/forms";
import { ModularQuestionnaire } from "@/components/forms/modular-questionnaire";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { formTitle, type FormCode, ALL_FORM_CODES } from "@/lib/ircc/catalog";
import { ADDABLE_COMPANION_FORMS } from "@/lib/ircc/kits";
import type { ProjectFormRow } from "@/lib/ircc/project-forms";

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

export function ProjectFormsPanel({
  locale,
  projectId,
  forms,
  answers,
  activeShareExpiresAt,
}: {
  locale: "en" | "fr";
  projectId: string;
  forms: ProjectFormRow[];
  answers: Record<string, unknown>;
  activeShareExpiresAt: string | null;
}) {
  const t = useTranslations("forms");
  const [addState, addAction, addPending] = useActionState(
    addFormToProjectAction,
    initialState,
  );
  const [shareState, shareAction, sharePending] = useActionState(
    createFormShareLinkAction,
    initialState,
  );
  const [revokeState, revokeAction, revokePending] = useActionState(
    revokeFormShareLinkAction,
    initialState,
  );
  const [saveState, saveAction, savePending] = useActionState(
    saveProjectAnswersAction,
    initialState,
  );
  const [genPending, startGen] = useTransition();
  const [downloadingKey, setDownloadingKey] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const [formCode, setFormCode] = useState<FormCode>("imm5475");

  const addOptions = [
    ...ADDABLE_COMPANION_FORMS,
    ...ALL_FORM_CODES.filter((c) => !ADDABLE_COMPANION_FORMS.includes(c)),
  ];

  function handleSave(next: Record<string, unknown>, section: string) {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("locale", locale);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(next));
    saveAction(fd);
  }

  function handleDownload(code?: string) {
    const key = code ?? "all";
    setGenError(null);
    setGenWarnings([]);
    setDownloadingKey(key);
    startGen(async () => {
      try {
        const result = await generateProjectPdfsAction(projectId, locale, code);
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

  const saveError =
    saveState.error &&
    ({
      invalid: t("errors.invalid"),
      unauthorized: t("errors.unauthorized"),
      save_failed: t("errors.saveFailed"),
    }[saveState.error] ??
      t("errors.generic"));

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("todoTitle")}
          </h2>
          {forms.length > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={genPending}
              onClick={() => handleDownload()}
            >
              {downloadingKey === "all" ? t("downloading") : t("downloadAll")}
            </Button>
          ) : null}
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {forms.length === 0 ? (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              {t("todoEmpty")}
            </li>
          ) : (
            forms.map((form) => (
              <li
                key={form.id}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-brand">
                    {formTitle(form.form_code as FormCode, locale)}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {form.form_code.toUpperCase()}
                    {form.is_required ? ` · ${t("required")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {t(`statuses.${form.status}`)}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={genPending}
                    onClick={() => handleDownload(form.form_code)}
                    aria-label={
                      downloadingKey === form.form_code
                        ? t("downloading")
                        : t("download")
                    }
                  >
                    {downloadingKey === form.form_code ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>
                </div>
              </li>
            ))
          )}
        </ul>
        {genError ? (
          <p className="text-sm text-destructive" role="alert">
            {genError.startsWith("Enter") || genError.startsWith("Could")
              ? genError
              : t("errors.generateFailed")}
          </p>
        ) : null}
        {genWarnings.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-700">
            {genWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        <form action={addAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="locale" value={locale} />
          <div className="min-w-[220px] flex-1 space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase">
              {t("addForm")}
            </label>
            <select
              name="formCode"
              value={formCode}
              onChange={(e) => setFormCode(e.target.value as FormCode)}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"
            >
              {addOptions.map((code) => (
                <option key={code} value={code}>
                  {formTitle(code, locale)}
                  {forms.some((f) => f.form_code === code)
                    ? ` · ${t("alreadyOnFile")}`
                    : ""}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" disabled={addPending}>
            {addPending ? t("adding") : t("addForm")}
          </Button>
          {addState.error ? (
            <p className="w-full text-sm text-destructive">{t("errors.addFailed")}</p>
          ) : null}
        </form>
      </section>

      <SurfaceCard className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("shareTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("shareHelp")}</p>
        </div>
        {activeShareExpiresAt ? (
          <p className="text-sm text-brand">
            {t("shareActive", {
              date: new Date(activeShareExpiresAt).toLocaleDateString(
                locale === "fr" ? "fr-CA" : "en-CA",
              ),
            })}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t("shareInactive")}</p>
        )}
        {shareState.shareUrl ? (
          <div className="space-y-2 rounded-xl border border-border bg-canvas p-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("shareCopy")}
            </p>
            <p className="break-all font-mono text-sm text-brand">
              {shareState.shareUrl}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <form action={shareAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="locale" value={locale} />
            <Button type="submit" disabled={sharePending}>
              {sharePending
                ? t("sharing")
                : activeShareExpiresAt
                  ? t("newShareLink")
                  : t("createShareLink")}
            </Button>
          </form>
          {activeShareExpiresAt ? (
            <form action={revokeAction}>
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" variant="outline" disabled={revokePending}>
                {t("revokeShareLink")}
              </Button>
            </form>
          ) : null}
        </div>
        {shareState.error || revokeState.error ? (
          <p className="text-sm text-destructive">{t("errors.shareFailed")}</p>
        ) : null}
      </SurfaceCard>

      <SurfaceCard>
        <ModularQuestionnaire
          formCodes={forms.map((f) => f.form_code)}
          initialAnswers={answers}
          onSave={handleSave}
          pending={savePending}
          statusMessage={saveState.message === "saved" ? t("saved") : null}
          errorMessage={saveError}
        />
      </SurfaceCard>
    </div>
  );
}
