"use client";

import { FileText, Send } from "lucide-react";
import {
  useActionState,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { staffSignContractAction } from "@/app/actions/contracts";
import {
  saveProjectContractAction,
  sendProjectContractAction,
  type ProjectContractActionState,
} from "@/app/actions/project-contracts";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SurfaceCard } from "@/components/layout/surface-card";
import { extraAutomationVariables } from "@/lib/booking/form-fields";
import { contractVariableCatalog } from "@/lib/contracts/variables";
import { defaultContractBodyHtml, sanitizeContractHtml } from "@/lib/contracts/html";
import {
  hasContractCopy,
  parseContractTranslations,
} from "@/lib/contracts/translations";
import {
  CONTRACT_BUILTIN_VARIABLES,
} from "@/lib/contracts/types";
import type {
  ProjectContractFileRow,
  ProjectContractRow,
} from "@/lib/contracts/project-contracts";
import {
  APP_LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/i18n/locales";

const initialState: ProjectContractActionState = {};

const EDITOR_CLASS =
  "min-h-[280px] rounded-xl border border-input bg-surface px-6 py-5 text-sm leading-relaxed shadow-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

const CHIP_CLASS =
  "rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40";
const FORM_CHIP_CLASS =
  "rounded-full border border-action/30 bg-action/5 px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40";

type LinkedFormField = {
  field_key: string;
  label: string;
  form_id: string;
};

function statusLabel(
  t: ReturnType<typeof useTranslations>,
  status: ProjectContractRow["status"],
) {
  return t(`contractStatus.${status}`);
}

function insertVariableChip(editor: HTMLElement, key: string) {
  editor.focus();
  if (key === "signature_client" || key === "signature_consultant") {
    const role = key === "signature_client" ? "client" : "consultant";
    document.execCommand(
      "insertHTML",
      false,
      `<div data-sign="${role}">${role === "client" ? "Client signature" : "Consultant signature"}</div>`,
    );
    return;
  }
  document.execCommand(
    "insertHTML",
    false,
    `<span data-var="${key}" contenteditable="false">{{${key}}}</span>`,
  );
}

export function ProjectContractPanel({
  locale,
  orgDefaultLocale,
  projectId,
  contract,
  archivedFiles,
  formTitle,
  formFields,
  canManage,
  envelopeId,
  clientSigned,
  needsConsultantSign,
  consultantExpectedName,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  projectId: string;
  contract: ProjectContractRow | null;
  archivedFiles: ProjectContractFileRow[];
  formTitle: string | null;
  formFields: LinkedFormField[];
  canManage: boolean;
  envelopeId: string | null;
  clientSigned: boolean;
  needsConsultantSign: boolean;
  consultantExpectedName: string | null;
}) {
  const t = useTranslations("projects.contracts");
  const ts = useTranslations("services");
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [title, setTitle] = useState(contract?.title ?? "");
  const [bodyHtml, setBodyHtml] = useState(contract?.body_html ?? "");
  const [consultantTypedName, setConsultantTypedName] = useState("");
  const [signPending, startSignTransition] = useTransition();
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
    if (sendState.message === "awaiting_form") {
      toast.success(t("sentAwaitingForm"));
      router.refresh();
    }
    const error = saveState.error || sendState.error;
    if (error) toast.error(t(`errors.${error}`));
  }, [saveState, sendState, t, router]);

  const formVariableOptions = useMemo(() => {
    if (!contract?.form_id) return [] as Array<{ key: string; label: string }>;
    const linked = formFields.filter((field) => field.form_id === contract.form_id);
    const seen = new Set<string>();
    const options: Array<{ key: string; label: string }> = [];
    for (const field of linked) {
      if (seen.has(field.field_key)) continue;
      seen.add(field.field_key);
      options.push({ key: field.field_key, label: field.label || field.field_key });
      for (const extraKey of Object.keys(
        extraAutomationVariables({ [field.field_key]: "" }),
      )) {
        if (seen.has(extraKey)) continue;
        seen.add(extraKey);
        options.push({ key: extraKey, label: extraKey });
      }
    }
    return contractVariableCatalog(options.map((item) => item.key))
      .filter((item) => item.kind === "form")
      .map((item) => ({
        key: item.key,
        label: options.find((row) => row.key === item.key)?.label ?? item.key,
      }));
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

  function onInsert(key: string) {
    const editor = editorRef.current;
    if (!editor || !editable) return;
    insertVariableChip(editor, key);
    setBodyHtml(editor.innerHTML);
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

        <p className="rounded-xl border border-border bg-canvas/60 px-4 py-3 text-sm text-muted-foreground">
          {contract.form_id
            ? t("linkedForm", { form: formTitle || t("linkedFormUntitled") })
            : t("linkedFormNone")}
        </p>

        {contract.status === "pending_signature" ? (
          <p className="rounded-xl border border-border bg-canvas/60 px-4 py-3 text-sm text-muted-foreground">
            {contract.form_id && !contract.form_submitted_at
              ? t("pendingHelpForm")
              : needsConsultantSign && clientSigned
                ? t("pendingHelpConsultant")
                : t("pendingHelpClient")}
          </p>
        ) : null}

        {canManage &&
        contract.status === "pending_signature" &&
        needsConsultantSign &&
        clientSigned &&
        envelopeId ? (
          <div className="space-y-3 rounded-xl border border-border bg-canvas/60 px-4 py-3">
            <Field>
              <FieldLabel htmlFor="project-consultant-sign" required>
                {t("consultantSignName")}
              </FieldLabel>
              <Input
                id="project-consultant-sign"
                value={consultantTypedName}
                onChange={(event) => setConsultantTypedName(event.target.value)}
                autoComplete="name"
              />
              <FieldHint>
                {t("consultantSignHint", {
                  name: consultantExpectedName || "—",
                })}
              </FieldHint>
            </Field>
            <Button
              type="button"
              size="sm"
              disabled={signPending || consultantTypedName.trim().length < 2}
              onClick={() => {
                startSignTransition(async () => {
                  const result = await staffSignContractAction(
                    envelopeId,
                    consultantTypedName,
                    "typed",
                    null,
                    locale,
                  );
                  if (result.error) {
                    toast.error(
                      t.has(`errors.${result.error}`)
                        ? t(`errors.${result.error}`)
                        : t("errors.send_failed"),
                    );
                    return;
                  }
                  toast.success(t("consultantSigned"));
                  router.refresh();
                });
              }}
            >
              {signPending ? t("consultantSigning") : t("signAsConsultant")}
            </Button>
          </div>
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
            <div className="space-y-2 border-t border-border/80 pt-3">
              <p className="text-xs font-medium text-muted-foreground">
                {t("variables")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CONTRACT_BUILTIN_VARIABLES.map((name) => (
                  <button
                    key={name}
                    type="button"
                    className={CHIP_CLASS}
                    onClick={() => onInsert(name)}
                  >
                    {ts.has(`variables.${name}`)
                      ? ts(`variables.${name}`)
                      : name}
                  </button>
                ))}
                {formVariableOptions.map((field) => (
                  <button
                    key={field.key}
                    type="button"
                    className={FORM_CHIP_CLASS}
                    onClick={() => onInsert(field.key)}
                    title={field.key}
                  >
                    {field.label}
                  </button>
                ))}
                {(["signature_client", "signature_consultant"] as const).map(
                  (name) => (
                    <button
                      key={name}
                      type="button"
                      className={FORM_CHIP_CLASS}
                      onClick={() => onInsert(name)}
                    >
                      {ts(`variables.${name}`)}
                    </button>
                  ),
                )}
              </div>
              {contract.form_id && formVariableOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("linkedFormEmpty")}
                </p>
              ) : null}
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
