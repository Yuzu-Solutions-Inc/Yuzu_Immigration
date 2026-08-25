"use client";

import { FileText, Send } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  saveProjectContractAction,
  sendProjectContractAction,
  type ProjectContractActionState,
} from "@/app/actions/project-contracts";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SurfaceCard } from "@/components/layout/surface-card";
import { contractVariableCatalog } from "@/lib/contracts/variables";
import { defaultContractBodyHtml, sanitizeContractHtml } from "@/lib/contracts/html";
import {
  hasContractCopy,
  parseContractTranslations,
} from "@/lib/contracts/translations";
import type {
  ProjectContractFileRow,
  ProjectContractRow,
} from "@/lib/contracts/project-contracts";
import type { BookingFormFieldRow } from "@/lib/booking/types";
import {
  APP_LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/i18n/locales";

const initialState: ProjectContractActionState = {};

const EDITOR_CLASS =
  "min-h-[280px] rounded-xl border border-input bg-surface px-6 py-5 text-sm leading-relaxed shadow-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

function statusLabel(
  t: ReturnType<typeof useTranslations>,
  status: ProjectContractRow["status"],
) {
  return t(`contractStatus.${status}`);
}

export function ProjectContractPanel({
  locale,
  orgDefaultLocale,
  projectId,
  contract,
  archivedFiles,
  formFields,
  canManage,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  projectId: string;
  contract: ProjectContractRow | null;
  archivedFiles: ProjectContractFileRow[];
  formFields: BookingFormFieldRow[];
  canManage: boolean;
}) {
  const t = useTranslations("projects.contracts");
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState(contract?.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(contract?.body_html ?? "");
  const [saveState, saveAction, savePending] = useActionState(
    saveProjectContractAction,
    initialState,
  );
  const [sendState, sendAction, sendPending] = useActionState(
    sendProjectContractAction,
    initialState,
  );

  useEffect(() => {
    if (contract) {
      setTitle(contract.title);
      setBodyHtml(contract.body_html);
      if (editorRef.current) editorRef.current.innerHTML = contract.body_html;
    }
  }, [contract]);

  useEffect(() => {
    if (saveState.message === "saved") {
      toast.success(t("saved"));
      router.refresh();
    }
    if (sendState.message === "sent") {
      toast.success(t("sent"));
      router.refresh();
    }
    const error = saveState.error || sendState.error;
    if (error) toast.error(t(`errors.${error}`));
  }, [saveState, sendState, t, router]);

  const variableKeys = useMemo(() => {
    const keys =
      contract?.form_id != null
        ? formFields
            .filter((field) => field.form_id === contract.form_id)
            .map((field) => field.field_key)
        : [];
    return contractVariableCatalog(keys).filter((item) => item.kind === "form");
  }, [contract?.form_id, formFields]);

  if (!contract) {
    return (
      <SurfaceCard className="space-y-2">
        <p className="text-sm text-muted-foreground">{t("noneAssigned")}</p>
      </SurfaceCard>
    );
  }

  const editable = canManage && ["draft", "completed"].includes(contract.status);
  const canSend = canManage && contract.status === "draft";

  function buildTranslations(): Record<AppLocale, string> {
    const copies = parseContractTranslations(contract?.translations ?? {});
    const fallback = editorRef.current?.innerHTML ?? bodyHtml;
    if (!hasContractCopy(copies[orgDefaultLocale])) {
      copies[orgDefaultLocale] = sanitizeContractHtml(fallback);
    }
    for (const code of APP_LOCALES) {
      if (!hasContractCopy(copies[code])) copies[code] = copies[orgDefaultLocale]!;
    }
    return copies as Record<AppLocale, string>;
  }

  async function submitSave(formData: FormData) {
    const html = editorRef.current?.innerHTML ?? bodyHtml;
    const translations = buildTranslations();
    translations[orgDefaultLocale] = html;
    formData.set("bodyHtml", html);
    formData.set("translations", JSON.stringify(translations));
    return saveAction(formData);
  }

  return (
    <div className="space-y-4">
      <SurfaceCard className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("subtitle", { version: contract.version })}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-brand">
            {statusLabel(t, contract.status)}
          </span>
        </div>

        {contract.status === "pending_signature" ? (
          <p className="rounded-xl border border-border bg-canvas/60 px-4 py-3 text-sm text-muted-foreground">
            {t("pendingHelp")}
          </p>
        ) : null}

        {contract.status === "completed" && editable ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            {t("editCompletedWarning")}
          </p>
        ) : null}

        <form action={submitSave} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="contractId" value={contract.id} />

          <Field>
            <FieldLabel htmlFor="project-contract-title">{t("contractTitle")}</FieldLabel>
            <Input
              id="project-contract-title"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              readOnly={!editable}
              maxLength={120}
            />
          </Field>

          <Field>
            <FieldLabel>{t("document")}</FieldLabel>
            <FieldHint>
              {t("documentHelp", { language: LOCALE_LABELS[orgDefaultLocale] })}
            </FieldHint>
            <div
              ref={editorRef}
              className={EDITOR_CLASS}
              contentEditable={editable}
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{
                __html: bodyHtml || defaultContractBodyHtml(orgDefaultLocale),
              }}
              onInput={() => setBodyHtml(editorRef.current?.innerHTML ?? "")}
            />
          </Field>

          {editable ? (
            <div className="flex flex-wrap gap-2">
              {variableKeys.map((item) => (
                <Button
                  key={item.key}
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const editor = editorRef.current;
                    if (!editor) return;
                    editor.focus();
                    document.execCommand(
                      "insertHTML",
                      false,
                      `<span data-var="${item.key}" contenteditable="false">{{${item.key}}}</span>`,
                    );
                    setBodyHtml(editor.innerHTML);
                  }}
                >
                  {`{{${item.key}}}`}
                </Button>
              ))}
            </div>
          ) : null}

          {editable ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" size="sm" disabled={savePending}>
                {savePending ? t("saving") : t("save")}
              </Button>
            </div>
          ) : null}
        </form>

        {editable && canSend ? (
          <form action={sendAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="contractId" value={contract.id} />
            <Button type="submit" size="sm" disabled={sendPending}>
              <Send className="size-4" />
              {sendPending ? t("sending") : t("sendForSignature")}
            </Button>
          </form>
        ) : null}
      </SurfaceCard>

      {archivedFiles.length > 0 ? (
        <SurfaceCard className="space-y-3">
          <h3 className="text-sm font-semibold text-brand">{t("archivedTitle")}</h3>
          <ul className="space-y-2">
            {archivedFiles.map((file) => (
              <li
                key={file.id}
                className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {file.title}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {t("versionLabel", { version: file.version })}
                </span>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      ) : null}
    </div>
  );
}
