"use client";

import { FileText, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  deleteContractTemplateAction,
  parseContractUploadAction,
  saveContractTemplateAction,
  type ContractActionState,
} from "@/app/actions/contracts";
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
import { defaultContractBodyHtml, sanitizeContractHtml } from "@/lib/contracts/html";
import { contractVariableCatalog } from "@/lib/contracts/variables";
import type { ContractTemplateRow } from "@/lib/contracts/types";
import type {
  BookingFormFieldRow,
  BookingServiceRow,
} from "@/lib/booking/types";

const initialState: ContractActionState = {};

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

function ContractEditor({
  locale,
  services,
  formFields,
  template,
  onCancel,
}: {
  locale: string;
  services: BookingServiceRow[];
  formFields: BookingFormFieldRow[];
  template?: ContractTemplateRow;
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
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [html, setHtml] = useState(
    template?.body_html || defaultContractBodyHtml(),
  );
  const [state, formAction, pending] = useActionState(
    saveContractTemplateAction,
    initialState,
  );
  const [uploadPending, startUpload] = useTransition();
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Switch
            id="contract-send"
            checked={sendOnBooking}
            onCheckedChange={setSendOnBooking}
          />
          <Label htmlFor="contract-send">{t("contractSendOnBooking")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="contract-countersign"
            checked={requireConsultant}
            onCheckedChange={setRequireConsultant}
          />
          <Label htmlFor="contract-countersign">
            {t("contractRequireConsultant")}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="contract-active"
            checked={isActive}
            onCheckedChange={setIsActive}
          />
          <Label htmlFor="contract-active">{t("active")}</Label>
        </div>
      </div>
      <FieldHint>{t("contractSendHelp")}</FieldHint>

      <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("contractDocument")}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".docx,.txt,.html,.htm"
            className="hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (!file) return;
              const data = new FormData();
              data.set("file", file);
              startUpload(async () => {
                const result = await parseContractUploadAction({}, data);
                if (result.error) {
                  toast.error(t(`errors.${result.error}`));
                  return;
                }
                if (result.html && editorRef.current) {
                  const next = sanitizeContractHtml(result.html);
                  editorRef.current.innerHTML = next;
                  setHtml(next);
                  toast.success(t("contractImported"));
                }
              });
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadPending}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" />
            {uploadPending ? t("contractImporting") : t("contractUpload")}
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

export function ServiceContractsButton({
  locale,
  services,
  formFields,
  templates,
  canManage,
}: {
  locale: string;
  services: BookingServiceRow[];
  formFields: BookingFormFieldRow[];
  templates: ContractTemplateRow[];
  canManage: boolean;
}) {
  const t = useTranslations("services");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ContractTemplateRow | null>(null);

  function closeEditor() {
    setCreating(false);
    setEditing(null);
  }

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
          </DialogHeader>
          <div className="min-h-0 overflow-x-hidden overflow-y-auto pr-1">
            {creating || editing ? (
              <ContractEditor
                locale={locale}
                services={services}
                formFields={formFields}
                template={editing ?? undefined}
                onCancel={closeEditor}
              />
            ) : (
              <div className="space-y-4">
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
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                        >
                          <div className="min-w-0">
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
                                onClick={() => setEditing(template)}
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
