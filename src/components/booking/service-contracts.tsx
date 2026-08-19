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
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { extraAutomationVariables } from "@/lib/booking/form-fields";
import { serviceTitle } from "@/lib/booking/service-i18n";
import {
  docxBufferToHtml,
  isLegacyWordDoc,
  plainTextToHtml,
} from "@/lib/contracts/docx";
import { defaultContractBodyHtml, sanitizeContractHtml } from "@/lib/contracts/html";
import {
  MAX_CONTRACT_HTML_CHARS,
  MAX_CONTRACT_UPLOAD_BYTES,
} from "@/lib/contracts/types";
import { contractVariableCatalog } from "@/lib/contracts/variables";
import type {
  ContractTemplateRow,
  StaffContractSignature,
} from "@/lib/contracts/types";
import type {
  BookingFormFieldRow,
  BookingServiceRow,
} from "@/lib/booking/types";

const initialState: ContractActionState = {};

const HEADER_SWITCH_CLASS =
  "h-7 w-12 shrink-0 data-[size=default]:h-7 data-[size=default]:w-12 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:data-checked:translate-x-5";

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

function variableChip(key: string) {
  if (key === "signature_client") {
    return `<div data-sign="client">Client signature</div>`;
  }
  if (key === "signature_consultant") {
    return `<div data-sign="consultant">Consultant signature</div>`;
  }
  return `<span data-var="${key}" contenteditable="false">{{${key}}}</span>`;
}

function ActiveHeaderSwitch({
  id,
  checked,
  onCheckedChange,
  label,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5">
      <Label htmlFor={id} className="text-sm font-semibold text-brand">
        {label}
      </Label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        className={HEADER_SWITCH_CLASS}
      />
    </div>
  );
}

function ContractEditor({
  locale,
  services,
  formFields,
  template,
  isActive,
  onCancel,
}: {
  locale: string;
  services: BookingServiceRow[];
  formFields: BookingFormFieldRow[];
  template?: ContractTemplateRow;
  isActive: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("services");
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(template?.title ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(
    template?.service_ids ?? [],
  );
  const [requireConsultant, setRequireConsultant] = useState(
    template?.require_consultant_signature ?? true,
  );
  const [sendOnBooking, setSendOnBooking] = useState(
    template?.send_on_booking ?? true,
  );
  const [html, setHtml] = useState(
    template?.body_html || defaultContractBodyHtml(),
  );
  const [importing, setImporting] = useState(false);
  const [state, formAction, pending] = useActionState(
    saveContractTemplateAction,
    initialState,
  );
  const seeded = useRef(false);

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

  useEffect(() => {
    if (seeded.current || !editorRef.current) return;
    editorRef.current.innerHTML = html;
    seeded.current = true;
  }, [html]);

  const formFieldsForServices = useMemo(() => {
    const formIds = new Set(
      services
        .filter((service) => serviceIds.includes(service.id) && service.form_id)
        .map((service) => service.form_id as string),
    );
    return formFields
      .filter((field) => formIds.has(field.form_id))
      .flatMap((field) => {
        const extras = extraAutomationVariables({ [field.field_key]: "" });
        return [field.field_key, ...Object.keys(extras)];
      });
  }, [formFields, serviceIds, services]);

  const catalog = useMemo(
    () => contractVariableCatalog(formFieldsForServices),
    [formFieldsForServices],
  );

  function syncHtml() {
    if (editorRef.current) setHtml(editorRef.current.innerHTML);
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
      if (editorRef.current) {
        editorRef.current.innerHTML = next;
        setHtml(next);
        toast.success(t("contractImported"));
      }
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

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="templateId" value={template?.id ?? ""} />
      <input type="hidden" name="bodyHtml" value={html} />
      <input type="hidden" name="serviceIds" value={JSON.stringify(serviceIds)} />
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

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("formAssignServices")}</p>
        <p className="text-xs text-muted-foreground">{t("contractAssignHelp")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const checked = serviceIds.includes(service.id);
            return (
              <label
                key={service.id}
                className="flex min-w-0 items-start gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setServiceIds([...serviceIds, service.id]);
                    } else {
                      setServiceIds(serviceIds.filter((id) => id !== service.id));
                    }
                  }}
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                />
                <span className="min-w-0 truncate font-medium">
                  {serviceTitle(service, locale)}
                </span>
              </label>
            );
          })}
        </div>
      </div>

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

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("contractDocument")}</p>
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
        <FieldHint>{t("contractUploadHelp")}</FieldHint>
        <div className="flex flex-wrap gap-1.5">
          {catalog.map((item) => (
            <button
              key={`${item.kind}-${item.key}`}
              type="button"
              className="rounded-lg border border-border bg-surface px-2 py-1 font-mono text-xs text-brand hover:bg-muted"
              onClick={() => {
                if (editorRef.current) {
                  insertAtCursor(editorRef.current, variableChip(item.key));
                  syncHtml();
                }
              }}
            >
              {`{{${item.key}}}`}
            </button>
          ))}
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={syncHtml}
          onBlur={syncHtml}
          className="min-h-[320px] rounded-xl border border-input bg-surface px-6 py-5 text-sm leading-relaxed shadow-elevated outline-none focus-visible:ring-2 focus-visible:ring-ring/40 [&_[data-var]]:mx-0.5 [&_[data-var]]:inline-flex [&_[data-var]]:rounded-md [&_[data-var]]:bg-muted [&_[data-var]]:px-1.5 [&_[data-var]]:py-0.5 [&_[data-var]]:font-mono [&_[data-var]]:text-xs [&_[data-var]]:text-brand [&_[data-sign]]:my-4 [&_[data-sign]]:rounded-xl [&_[data-sign]]:border [&_[data-sign]]:border-dashed [&_[data-sign]]:border-border [&_[data-sign]]:px-4 [&_[data-sign]]:py-6 [&_[data-sign]]:text-xs [&_[data-sign]]:text-muted-foreground"
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("formFieldBack")}
        </Button>
        <Button type="submit" disabled={pending || serviceIds.length === 0}>
          {pending ? t("saving") : template ? t("contractSave") : t("contractCreate")}
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
    <div className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
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
    </div>
  );
}

export function ServiceContractsButton({
  locale,
  services,
  formFields,
  templates,
  signature,
  canManage,
}: {
  locale: string;
  services: BookingServiceRow[];
  formFields: BookingFormFieldRow[];
  templates: ContractTemplateRow[];
  signature: StaffContractSignature;
  canManage: boolean;
}) {
  const t = useTranslations("services");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContractTemplateRow | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [activePending, startActive] = useTransition();

  function closeEditor() {
    setCreating(false);
    setEditing(null);
    setIsActive(true);
  }

  const editingOpen = creating || Boolean(editing);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          closeEditor();
          setOpen(true);
        }}
      >
        <FileText className="size-4" />
        {t("contracts")}
        {templates.length > 0 ? ` (${templates.length})` : null}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) closeEditor();
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-4xl"
          showCloseButton
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              {editingOpen ? (
                <ActiveHeaderSwitch
                  id="contract-is-active-header"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  label={t("active")}
                />
              ) : null}
              <div className="min-w-0 space-y-2">
                <DialogTitle>
                  {creating
                    ? t("newContractTitle")
                    : editing
                      ? t("editContractTitle")
                      : t("contractsTitle")}
                </DialogTitle>
                <DialogDescription>
                  {editingOpen ? t("contractEditorSubtitle") : t("contractsSubtitle")}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="min-h-0 overflow-x-hidden overflow-y-auto pr-1">
            {editingOpen ? (
              <ContractEditor
                locale={locale}
                services={services}
                formFields={formFields}
                template={editing ?? undefined}
                isActive={isActive}
                onCancel={closeEditor}
              />
            ) : (
              <div className="space-y-4">
                {canManage ? (
                  <StaffSignaturePanel locale={locale} signature={signature} />
                ) : null}
                {templates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("contractsEmpty")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {templates.map((template) => {
                      const assigned = services.filter((service) =>
                        template.service_ids.includes(service.id),
                      );
                      return (
                        <li
                          key={template.id}
                          className="flex flex-wrap items-center gap-3 rounded-xl border border-border px-3 py-2"
                        >
                          {canManage ? (
                            <ActiveHeaderSwitch
                              id={`contract-active-${template.id}`}
                              checked={template.is_active}
                              onCheckedChange={(value) => {
                                startActive(async () => {
                                  const result = await setContractTemplateActiveAction(
                                    template.id,
                                    value,
                                    locale,
                                  );
                                  if (result.error) {
                                    toast.error(t(`errors.${result.error}`));
                                    return;
                                  }
                                  router.refresh();
                                });
                              }}
                              label={t("active")}
                            />
                          ) : null}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{template.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {assigned.length === 0
                                ? t("contractNoServices")
                                : assigned
                                    .map((service) => serviceTitle(service, locale))
                                    .join(", ")}
                              {template.is_active ? "" : ` · ${t("inactive")}`}
                            </p>
                          </div>
                          {canManage ? (
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                disabled={activePending}
                                onClick={() => {
                                  setIsActive(template.is_active);
                                  setCreating(false);
                                  setEditing(template);
                                }}
                                aria-label={t("editContractTitle")}
                              >
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="text-destructive hover:bg-destructive/10"
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
                                    return;
                                  }
                                  toast.success(
                                    t(
                                      result.message === "archived"
                                        ? "contractArchived"
                                        : "contractDeleted",
                                    ),
                                  );
                                }}
                                aria-label={t("delete")}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      setEditing(null);
                      setIsActive(true);
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
