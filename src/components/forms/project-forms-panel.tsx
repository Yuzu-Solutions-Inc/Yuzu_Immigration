"use client";

import { useActionState, useState, useTransition } from "react";
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
  const [genError, setGenError] = useState<string | null>(null);
  const [genWarnings, setGenWarnings] = useState<string[]>([]);
  const [formCode, setFormCode] = useState<FormCode>("imm5475");

  const existing = new Set(forms.map((f) => f.form_code));
  const addable = ADDABLE_COMPANION_FORMS.filter((c) => !existing.has(c));

  function handleSave(next: Record<string, unknown>, section: string) {
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("locale", locale);
    fd.set("currentSection", section);
    fd.set("answers", JSON.stringify(next));
    saveAction(fd);
  }

  function handleGenerate() {
    setGenError(null);
    setGenWarnings([]);
    startGen(async () => {
      const result = await generateProjectPdfsAction(projectId, locale);
      if (!result.ok) {
        setGenError(result.error);
        return;
      }
      setGenWarnings(result.warnings);
      const bin = atob(result.zipBase64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blob = new Blob([bytes], { type: "application/zip" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
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
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("todoTitle")}
        </h2>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
          {forms.length === 0 ? (
            <li className="px-5 py-4 text-sm text-muted-foreground">
              {t("todoEmpty")}
            </li>
          ) : (
            forms.map((form) => (
              <li
                key={form.id}
                className="flex items-center justify-between gap-3 px-5 py-4"
              >
                <div>
                  <p className="font-medium text-brand">
                    {formTitle(form.form_code as FormCode, locale)}
                  </p>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {form.form_code.toUpperCase()}
                    {form.is_required ? ` · ${t("required")}` : ""}
                  </p>
                </div>
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {t(`statuses.${form.status}`)}
                </span>
              </li>
            ))
          )}
        </ul>

        {addable.length > 0 ? (
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
                {addable.map((code) => (
                  <option key={code} value={code}>
                    {formTitle(code, locale)}
                  </option>
                ))}
                {ALL_FORM_CODES.filter(
                  (c) => !existing.has(c) && !addable.includes(c),
                ).map((code) => (
                  <option key={code} value={code}>
                    {formTitle(code, locale)}
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
        ) : null}
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

      <SurfaceCard className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-brand">
              {t("generateTitle")}
            </h3>
            <p className="text-sm text-muted-foreground">{t("generateHelp")}</p>
          </div>
          <Button type="button" disabled={genPending} onClick={handleGenerate}>
            {genPending ? t("generating") : t("generate")}
          </Button>
        </div>
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
