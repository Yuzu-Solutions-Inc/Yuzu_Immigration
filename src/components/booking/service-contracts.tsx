"use client";

import { FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  deleteContractTemplateAction,
  saveContractTemplateAction,
  saveStaffContractSignatureAction,
  setContractTemplateActiveAction,
  type ContractActionState,
} from "@/app/actions/contracts";
import { SignatureCapture, type SignatureCaptureKind } from "@/components/contracts/signature-capture";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { contractVariableCatalog } from "@/lib/contracts/variables";
import { serviceTitle } from "@/lib/booking/service-i18n";
import {
  docxBufferToHtml,
  isLegacyWordDoc,
  plainTextToHtml,
} from "@/lib/contracts/docx";
import { defaultContractBodyHtml, sanitizeContractHtml } from "@/lib/contracts/html";
import {
  hasContractCopy,
  parseContractTranslations,
} from "@/lib/contracts/translations";
import {
  CONTRACT_BUILTIN_VARIABLES,
  MAX_CONTRACT_HTML_CHARS,
  MAX_CONTRACT_UPLOAD_BYTES,
} from "@/lib/contracts/types";
import type {
  ContractTemplateRow,
  StaffContractSignature,
} from "@/lib/contracts/types";
import type {
  BookingFormFieldRow,
  BookingFormRow,
  BookingServiceRow,
} from "@/lib/booking/types";
import {
  APP_LOCALES,
  LOCALE_LABELS,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/locales";

const initialState: ContractActionState = {};

const HEADER_SWITCH_CLASS =
  "h-7 w-12 shrink-0 data-[size=default]:h-7 data-[size=default]:w-12 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:data-checked:translate-x-5";

const EDITOR_CLASS =
  "min-h-[320px] rounded-xl border border-input bg-surface px-6 py-5 text-sm leading-relaxed shadow-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_[data-var]]:mx-0.5 [&_[data-var]]:inline-flex [&_[data-var]]:rounded-md [&_[data-var]]:bg-muted [&_[data-var]]:px-1.5 [&_[data-var]]:py-0.5 [&_[data-var]]:font-mono [&_[data-var]]:text-xs [&_[data-var]]:text-brand [&_[data-sign]]:my-4 [&_[data-sign]]:rounded-xl [&_[data-sign]]:border [&_[data-sign]]:border-dashed [&_[data-sign]]:border-border [&_[data-sign]]:px-4 [&_[data-sign]]:py-6 [&_[data-sign]]:text-xs [&_[data-sign]]:text-muted-foreground";

const EMPTY_BODY = "<p></p>";

const SIGNATURE_LABELS: Record<AppLocale, { client: string; consultant: string }> =
  {
    en: { client: "Client signature", consultant: "Consultant signature" },
    fr: { client: "Signature du client", consultant: "Signature du consultant" },
    es: { client: "Firma del cliente", consultant: "Firma del consultor" },
  };

function emptyCopies(): Record<AppLocale, string> {
  return { en: EMPTY_BODY, fr: EMPTY_BODY, es: EMPTY_BODY };
}

function initialCopies(
  template: ContractTemplateRow | undefined,
  orgDefaultLocale: AppLocale,
) {
  const copies = emptyCopies();
  if (!template) {
    copies[orgDefaultLocale] = defaultContractBodyHtml(orgDefaultLocale);
    return copies;
  }
  const translations = parseContractTranslations(template.translations);
  for (const code of APP_LOCALES) {
    if (translations[code]) copies[code] = translations[code]!;
  }
  if (!hasContractCopy(copies[orgDefaultLocale]) && template.body_html) {
    copies[orgDefaultLocale] = template.body_html;
  }
  if (!hasContractCopy(copies[orgDefaultLocale])) {
    copies[orgDefaultLocale] = defaultContractBodyHtml(orgDefaultLocale);
  }
  return copies;
}

function insertAtCursor(root: HTMLElement, html: string) {
  root.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    root.insertAdjacentHTML("beforeend", html);
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const frag = document.createDocumentFragment();
  let last: ChildNode | null = null;
  while (temp.firstChild) {
    last = temp.firstChild;
    frag.appendChild(temp.firstChild);
  }
  range.insertNode(frag);
  if (last) {
    range.setStartAfter(last);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function variableChip(key: string, locale: AppLocale) {
  if (key === "signature_client") {
    return `<div data-sign="client">${SIGNATURE_LABELS[locale].client}</div>`;
  }
  if (key === "signature_consultant") {
    return `<div data-sign="consultant">${SIGNATURE_LABELS[locale].consultant}</div>`;
  }
  return `<span data-var="${key}" contenteditable="false">{{${key}}}</span>`;
}

function ContractEditor({
  locale,
  orgDefaultLocale,
  services,
  forms,
  formFields,
  template,
  isActive,
  onCancel,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  services: BookingServiceRow[];
  forms: BookingFormRow[];
  formFields: BookingFormFieldRow[];
  template?: ContractTemplateRow;
  isActive: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("services");
  const editorRefs = useRef<Partial<Record<AppLocale, HTMLDivElement | null>>>({});
  const seeded = useRef<Set<AppLocale>>(new Set());
  const lastLocale = useRef<AppLocale>(orgDefaultLocale);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(template?.title ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(
    template?.service_ids ?? [],
  );
  const [formId, setFormId] = useState(template?.form_id ?? "");
  const [requireConsultant, setRequireConsultant] = useState(
    template?.require_consultant_signature ?? true,
  );
  const [sendOnBooking, setSendOnBooking] = useState(
    template?.send_on_booking ?? true,
  );
  const [copies, setCopies] = useState<Record<AppLocale, string>>(() =>
    initialCopies(template, orgDefaultLocale),
  );
  const [importing, setImporting] = useState(false);
  const [state, formAction, pending] = useActionState(
    saveContractTemplateAction,
    initialState,
  );

  useEffect(() => {
    if (state.message === "created" || state.message === "saved") {
      toast.success(
        t(state.message === "created" ? "contractCreated" : "contractSaved"),
      );
      onCancel();
    }
    if (state.error) toast.error(t(`errors.${state.error}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const formVariables = useMemo(() => {
    const keys = formId
      ? formFields
          .filter((field) => field.form_id === formId)
          .map((field) => field.field_key)
      : [];
    return contractVariableCatalog(keys).filter((item) => item.kind === "form");
  }, [formFields, formId]);

  function snapshotCopies() {
    const next = { ...copies };
    for (const code of APP_LOCALES) {
      const el = editorRefs.current[code];
      if (el) next[code] = el.innerHTML;
    }
    setCopies(next);
    return next;
  }

  function bindEditor(code: AppLocale) {
    return (el: HTMLDivElement | null) => {
      editorRefs.current[code] = el;
      if (el && !seeded.current.has(code)) {
        el.innerHTML = copies[code];
        seeded.current.add(code);
      }
    };
  }

  function syncHtml(code: AppLocale) {
    const el = editorRefs.current[code];
    if (!el) return;
    setCopies((prev) => ({ ...prev, [code]: el.innerHTML }));
  }

  function insertVariable(key: string) {
    const code = lastLocale.current;
    const editor = editorRefs.current[code];
    if (!editor) return;
    insertAtCursor(editor, variableChip(key, code));
    syncHtml(code);
  }

  async function importDocument(file: File) {
    if (file.size > MAX_CONTRACT_UPLOAD_BYTES) {
      toast.error(t("errors.file_too_large"));
      return;
    }
    const name = file.name.toLowerCase();
    setImporting(true);
    try {
      let next = "";
      if (name.endsWith(".docx")) {
        const buffer = await file.arrayBuffer();
        if (isLegacyWordDoc(buffer)) {
          toast.error(t("errors.unsupported_file"));
          return;
        }
        next = await docxBufferToHtml(buffer);
      } else if (name.endsWith(".txt")) {
        next = plainTextToHtml(await file.text());
      } else if (name.endsWith(".html") || name.endsWith(".htm")) {
        next = sanitizeContractHtml(await file.text());
      } else {
        toast.error(t("errors.unsupported_file"));
        return;
      }
      if (next.length > MAX_CONTRACT_HTML_CHARS) {
        toast.error(t("errors.file_too_large"));
        return;
      }
      const code = lastLocale.current;
      const editor = editorRefs.current[code];
      if (editor) editor.innerHTML = next;
      setCopies((prev) => ({ ...prev, [code]: next }));
      toast.success(t("contractImported"));
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      if (code === "empty_document" || code === "unsupported_file") {
        toast.error(t(`errors.${code}`));
        return;
      }
      toast.error(t("errors.invalid_upload"));
    } finally {
      setImporting(false);
    }
  }

  async function submitAction(formData: FormData) {
    const next = snapshotCopies();
    formData.set("translations", JSON.stringify(next));
    formData.set("bodyHtml", next[orgDefaultLocale] ?? "");
    return formAction(formData);
  }

  const defaultCopyReady = hasContractCopy(copies[orgDefaultLocale]);

  return (
    <form action={submitAction} className="min-w-0 space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="templateId" value={template?.id ?? ""} />
      <input type="hidden" name="bodyHtml" value={copies[orgDefaultLocale]} />
      <input
        type="hidden"
        name="translations"
        value={JSON.stringify(copies)}
      />
      <input type="hidden" name="serviceIds" value={JSON.stringify(serviceIds)} />
      <input type="hidden" name="formId" value={formId} />
      <input
        type="hidden"
        name="requireConsultantSignature"
        value={requireConsultant ? "on" : "off"}
      />
      <input
        type="hidden"
        name="sendOnBooking"
        value={sendOnBooking ? "on" : "off"}
      />
      <input type="hidden" name="isActive" value={isActive ? "on" : "off"} />

      <Field>
        <FieldLabel htmlFor="contract-title" required>
          {t("contractTitle")}
        </FieldLabel>
        <Input
          id="contract-title"
          name="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          maxLength={120}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="contract-form">{t("contractFormLabel")}</FieldLabel>
        <NativeSelect
          id="contract-form"
          value={formId}
          onChange={(event) => setFormId(event.target.value)}
        >
          <option value="">{t("contractFormNone")}</option>
          {forms.map((form) => (
            <option key={form.id} value={form.id}>
              {form.title}
            </option>
          ))}
        </NativeSelect>
        <p className="mt-1 text-xs text-muted-foreground">{t("contractFormHelp")}</p>
      </Field>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-brand">
            {t("automationServices")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("contractAssignHelp")}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const checked = serviceIds.includes(service.id);
            return (
              <label
                key={service.id}
                className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setServiceIds((prev) => [...prev, service.id]);
                    } else {
                      setServiceIds((prev) =>
                        prev.filter((id) => id !== service.id),
                      );
                    }
                  }}
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                />
                <span className="min-w-0 truncate font-medium">
                  {serviceTitle(service, locale, orgDefaultLocale)}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-brand">
            {t("contractDocument")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("contractCopyHelp", {
              language: LOCALE_LABELS[orgDefaultLocale],
            })}
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".docx,.txt,.html,.htm,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="hidden"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void importDocument(file);
          }}
        />
        <Tabs
          defaultValue={orgDefaultLocale}
          onValueChange={(value) => {
            if (isAppLocale(String(value))) lastLocale.current = value;
          }}
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <TabsList variant="line" className="min-w-0 flex-1">
              {APP_LOCALES.map((code) => (
                <TabsTrigger key={code} value={code}>
                  {LOCALE_LABELS[code]}
                  {code === orgDefaultLocale ? (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {t("automationDefaultLang")}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="size-4" />
              {importing ? t("contractImporting") : t("contractUpload")}
            </Button>
          </div>
          {APP_LOCALES.map((code) => (
            <TabsContent
              key={code}
              value={code}
              keepMounted
              className="space-y-3 pt-3"
            >
              <Field>
                <FieldLabel
                  htmlFor={`contract-body-${code}`}
                  required={code === orgDefaultLocale}
                >
                  {t("contractDocument")}
                </FieldLabel>
                <div
                  ref={bindEditor(code)}
                  id={`contract-body-${code}`}
                  contentEditable
                  suppressContentEditableWarning
                  onFocus={() => {
                    lastLocale.current = code;
                  }}
                  onInput={() => syncHtml(code)}
                  onBlur={() => syncHtml(code)}
                  className={EDITOR_CLASS}
                />
              </Field>
              <p className="text-xs text-muted-foreground">
                {t("contractUploadHelp")}
              </p>
            </TabsContent>
          ))}
        </Tabs>
        <div className="space-y-2 border-t border-border/80 pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("automationVariables")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {CONTRACT_BUILTIN_VARIABLES.map((name) => (
              <button
                key={name}
                type="button"
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40"
                onClick={() => insertVariable(name)}
              >
                {t.has(`variables.${name}`) ? t(`variables.${name}`) : name}
              </button>
            ))}
            {formVariables.map((field) => (
              <button
                key={field.key}
                type="button"
                className="rounded-full border border-action/30 bg-action/5 px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40"
                onClick={() => insertVariable(field.key)}
              >
                {field.key}
              </button>
            ))}
            {(["signature_client", "signature_consultant"] as const).map((name) => (
              <button
                key={name}
                type="button"
                className="rounded-full border border-action/30 bg-action/5 px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40"
                onClick={() => insertVariable(name)}
              >
                {t(`variables.${name}`)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <h3 className="text-sm font-semibold text-brand">
          {t("automationOptionsSection")}
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="contract-send" className="text-sm font-medium">
                {t("contractSendOnBooking")}
              </Label>
              <p className="text-xs text-muted-foreground">{t("contractSendHelp")}</p>
            </div>
            <Switch
              id="contract-send"
              checked={sendOnBooking}
              onCheckedChange={setSendOnBooking}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="contract-countersign" className="text-sm font-medium">
                {t("contractRequireConsultant")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("contractRequireConsultantHelp")}
              </p>
            </div>
            <Switch
              id="contract-countersign"
              checked={requireConsultant}
              onCheckedChange={setRequireConsultant}
            />
          </div>
        </div>
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("automationBack")}
        </Button>
        <Button type="submit" disabled={pending || serviceIds.length === 0 || !defaultCopyReady}>
          {pending ? t("saving") : template ? t("save") : t("contractCreate")}
        </Button>
      </DialogFooter>
    </form>
  );
}

function StaffSignaturePanel({
  locale,
  signature,
}: {
  locale: string;
  signature: StaffContractSignature;
}) {
  const t = useTranslations("services");
  const tSign = useTranslations("signContract");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [presignAll, setPresignAll] = useState(signature.presignAll);
  const [kind, setKind] = useState<SignatureCaptureKind>(
    signature.image ? "uploaded" : "typed",
  );
  const [typedName, setTypedName] = useState(signature.typedName);
  const [image, setImage] = useState(signature.image ?? "");

  useEffect(() => {
    setPresignAll(signature.presignAll);
    setKind(signature.image ? "uploaded" : "typed");
    setTypedName(signature.typedName);
    setImage(signature.image ?? "");
  }, [signature]);

  return (
    <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
      <div>
        <h3 className="text-sm font-semibold text-brand">{t("contractSignature")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("contractSignatureHelp")}
        </p>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="contract-presign-all" className="text-sm font-medium">
            {t("contractPresignAll")}
          </Label>
          <p className="text-xs text-muted-foreground">{t("contractPresignHelp")}</p>
        </div>
        <Switch
          id="contract-presign-all"
          checked={presignAll}
          onCheckedChange={setPresignAll}
        />
      </div>
      <SignatureCapture
        kind={kind}
        onKindChange={setKind}
        typedName={typedName}
        onTypedNameChange={setTypedName}
        image={image}
        onImageChange={setImage}
        nameHint={tSign("legalNameHint")}
        onError={(key) => toast.error(t(`errors.${key}`))}
      />
      <Button
        type="button"
        size="sm"
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            const storedKind = kind === "typed" ? "typed" : "drawn";
            const result = await saveStaffContractSignatureAction({
              locale,
              presignAll,
              kind: storedKind,
              typedName,
              image: storedKind === "drawn" ? image : null,
            });
            if (result.error) {
              toast.error(t(`errors.${result.error}`));
              return;
            }
            toast.success(t("contractSignatureSaved"));
            router.refresh();
          });
        }}
      >
        {pending ? t("saving") : t("contractSignatureSave")}
      </Button>
    </section>
  );
}

export function ServiceContractsButton({
  locale,
  orgDefaultLocale,
  services,
  forms,
  formFields,
  templates,
  signature,
  canManage,
  initialOpen = false,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  services: BookingServiceRow[];
  forms: BookingFormRow[];
  formFields: BookingFormFieldRow[];
  templates: ContractTemplateRow[];
  signature: StaffContractSignature;
  canManage: boolean;
  initialOpen?: boolean;
}) {
  const t = useTranslations("services");
  const [open, setOpen] = useState(initialOpen);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContractTemplateRow | null>(null);
  const [formActive, setFormActive] = useState(true);
  const serviceTitleById = useMemo(
    () =>
      new Map(
        services.map((service) => [
          service.id,
          serviceTitle(service, locale, orgDefaultLocale),
        ]),
      ),
    [locale, orgDefaultLocale, services],
  );

  useEffect(() => {
    if (!initialOpen) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("contracts") !== "1") return;
    url.searchParams.delete("contracts");
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState(null, "", next);
  }, [initialOpen]);

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormActive(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          closeForm();
          setOpen(true);
        }}
      >
        <FileText className="size-4" />
        {t("contracts")}
        {templates.length > 0 ? ` (${templates.length})` : ""}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) closeForm();
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-4xl"
          showCloseButton
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0 space-y-2">
                <DialogTitle>
                  {creating || editing
                    ? editing
                      ? t("editContractTitle")
                      : t("newContractTitle")
                    : t("contractsTitle")}
                </DialogTitle>
                <DialogDescription>
                  {creating || editing
                    ? t("contractEditorSubtitle")
                    : t("contractsSubtitle")}
                </DialogDescription>
              </div>
              {creating || editing ? (
                <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5">
                  <Label
                    htmlFor="contract-active-header"
                    className="text-sm font-semibold text-brand"
                  >
                    {t("automationActive")}
                  </Label>
                  <Switch
                    id="contract-active-header"
                    checked={formActive}
                    onCheckedChange={setFormActive}
                    className={HEADER_SWITCH_CLASS}
                  />
                </div>
              ) : null}
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-x-hidden overflow-y-auto pr-1">
            {creating || editing ? (
              <ContractEditor
                locale={locale}
                orgDefaultLocale={orgDefaultLocale}
                services={services}
                forms={forms}
                formFields={formFields}
                template={editing ?? undefined}
                isActive={formActive}
                onCancel={closeForm}
              />
            ) : (
              <div className="space-y-4">
                <StaffSignaturePanel locale={locale} signature={signature} />
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("contractsEmpty")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {templates.map((template) => {
                      const names = template.service_ids
                        .map((id) => serviceTitleById.get(id))
                        .filter(Boolean);
                      return (
                        <li
                          key={template.id}
                          className="rounded-xl border border-border px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-brand">
                                {template.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {names.length === 0
                                  ? t("noneAssigned")
                                  : names.join(", ")}
                              </p>
                            </div>
                            {canManage ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <Switch
                                  checked={template.is_active}
                                  aria-label={
                                    template.is_active
                                      ? t("automationActive")
                                      : t("automationPaused")
                                  }
                                  onCheckedChange={async (checked) => {
                                    const result =
                                      await setContractTemplateActiveAction(
                                        template.id,
                                        checked,
                                        locale,
                                      );
                                    if (result.error) {
                                      toast.error(t(`errors.${result.error}`));
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setFormActive(template.is_active);
                                    setEditing(template);
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={async () => {
                                    if (!window.confirm(t("contractDeleteConfirm"))) {
                                      return;
                                    }
                                    const result = await deleteContractTemplateAction(
                                      template.id,
                                      locale,
                                    );
                                    if (result.error) {
                                      toast.error(t(`errors.${result.error}`));
                                    } else {
                                      toast.success(
                                        t(
                                          result.message === "archived"
                                            ? "contractArchived"
                                            : "contractDeleted",
                                        ),
                                      );
                                    }
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {template.is_active
                                  ? t("automationActive")
                                  : t("automationPaused")}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={services.length === 0}
                    onClick={() => {
                      setEditing(null);
                      setFormActive(true);
                      setCreating(true);
                    }}
                  >
                    <Plus className="size-4" />
                    {t("newContract")}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
