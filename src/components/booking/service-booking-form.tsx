"use client";

import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  deleteBookingFormAction,
  saveBookingFormAction,
  type FormFieldActionState,
} from "@/app/actions/service-form-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BOOKING_FORM_FIELD_TYPES,
  BOOKING_FORM_PRESETS,
  MAX_BOOKING_FORM_FIELDS,
  isReservedBookingFieldKey,
  slugFromFieldLabel,
  type BookingFormPreset,
} from "@/lib/booking/form-fields";
import { isCompositeFieldType } from "@/lib/booking/composite-fields";
import type { BookingFormFieldType } from "@/db/schema";
import type {
  BookingFormFieldRow,
  BookingFormRow,
  BookingServiceRow,
} from "@/lib/booking/types";
import { serviceTitle } from "@/lib/booking/service-i18n";

const initialState: FormFieldActionState = {};

const BUILTIN_QUESTIONS = [
  { key: "first_name", labelKey: "formBuiltinFirstName" },
  { key: "last_name", labelKey: "formBuiltinLastName" },
  { key: "email", labelKey: "formBuiltinEmail" },
  { key: "phone", labelKey: "formBuiltinPhone" },
  { key: "preferred_language", labelKey: "formBuiltinLanguage" },
] as const;

type DraftField = {
  clientId: string;
  persisted: boolean;
  label: string;
  fieldKey: string;
  helpText: string;
  fieldType: BookingFormFieldType;
  optionsText: string;
  required: boolean;
  keyTouched: boolean;
};

function newClientId() {
  return `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function draftsFromFields(fields: BookingFormFieldRow[]): DraftField[] {
  return [...fields]
    .filter((field) => !isReservedBookingFieldKey(field.field_key))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((field) => ({
      clientId: field.id,
      persisted: true,
      label: field.label,
      fieldKey: field.field_key,
      helpText: field.help_text ?? "",
      fieldType: field.field_type,
      optionsText: (field.options ?? []).join("\n"),
      required: field.required,
      keyTouched: true,
    }));
}

function ServiceCheckboxes({
  locale,
  services,
  forms,
  currentFormId,
  selected,
  onChange,
}: {
  locale: string;
  services: BookingServiceRow[];
  forms: BookingFormRow[];
  currentFormId?: string;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const t = useTranslations("services");
  const formTitleById = useMemo(
    () => new Map(forms.map((form) => [form.id, form.title])),
    [forms],
  );
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t("formAssignServices")}</p>
      <p className="text-xs text-muted-foreground">{t("formAssignHelp")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {services.map((service) => {
          const checked = selected.includes(service.id);
          const otherFormId =
            service.form_id && service.form_id !== currentFormId
              ? service.form_id
              : null;
          const otherFormTitle = otherFormId
            ? formTitleById.get(otherFormId)
            : null;
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
                    if (otherFormId) {
                      const serviceName = serviceTitle(service, locale);
                      const formName = otherFormTitle ?? t("formUnknown");
                      if (
                        !window.confirm(
                          t("formAssignConflictConfirm", {
                            service: serviceName,
                            form: formName,
                          }),
                        )
                      ) {
                        return;
                      }
                    }
                    onChange([...selected, service.id]);
                  } else {
                    onChange(selected.filter((id) => id !== service.id));
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
  );
}

function FormEditor({
  locale,
  services,
  forms,
  form,
  fields,
  onCancel,
}: {
  locale: string;
  services: BookingServiceRow[];
  forms: BookingFormRow[];
  form?: BookingFormRow;
  fields: BookingFormFieldRow[];
  onCancel: () => void;
}) {
  const t = useTranslations("services");
  const [title, setTitle] = useState(form?.title ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(() =>
    form ? services.filter((row) => row.form_id === form.id).map((row) => row.id) : [],
  );
  const [drafts, setDrafts] = useState<DraftField[]>(() => draftsFromFields(fields));
  const [state, formAction, pending] = useActionState(
    saveBookingFormAction,
    initialState,
  );

  useEffect(() => {
    if (state.message === "created" || state.message === "saved") {
      toast.success(t(state.message === "created" ? "formCreated" : "formSaved"));
      onCancel();
    }
    if (state.error) toast.error(t(`errors.${state.error}`));
    // Close/toast only when the action result changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function updateDraft(clientId: string, patch: Partial<DraftField>) {
    setDrafts((prev) =>
      prev.map((field) =>
        field.clientId === clientId ? { ...field, ...patch } : field,
      ),
    );
  }

  function addPreset(preset: BookingFormPreset) {
    const used = new Set(drafts.map((field) => field.fieldKey).filter(Boolean));
    const room = MAX_BOOKING_FORM_FIELDS - drafts.length;
    if (room <= 0) {
      toast.error(t("formPresetTooMany"));
      return;
    }
    const added: DraftField[] = [];
    for (const field of preset.fields) {
      if (added.length >= room) break;
      if (used.has(field.fieldKey)) continue;
      used.add(field.fieldKey);
      added.push({
        clientId: newClientId(),
        persisted: false,
        label: t(field.labelKey),
        fieldKey: field.fieldKey,
        helpText: "",
        fieldType: field.fieldType,
        optionsText: field.optionsKey ? t(field.optionsKey) : "",
        required: field.required,
        keyTouched: true,
      });
    }
    if (added.length === 0) {
      toast.info(t("formPresetSkipped"));
      return;
    }
    setDrafts((prev) => [...prev, ...added]);
    toast.success(t("formPresetAdded", { count: added.length }));
  }

  const payload = drafts.map((field) => ({
    id: field.persisted ? field.clientId : "",
    label: field.label,
    fieldKey: field.fieldKey,
    helpText: field.helpText,
    fieldType: field.fieldType,
    options:
      field.fieldType === "select"
        ? field.optionsText
            .split(/\r?\n|,/)
            .map((item) => item.trim())
            .filter(Boolean)
        : [],
    required: field.required,
  }));

  return (
    <form
      action={formAction}
      className="min-w-0 space-y-5"
      onSubmit={(event) => {
        const moving = serviceIds.filter((serviceId) => {
          const service = services.find((row) => row.id === serviceId);
          return service?.form_id && service.form_id !== form?.id;
        });
        if (moving.length > 0) {
          const names = moving
            .map((id) => {
              const service = services.find((row) => row.id === id);
              return service ? serviceTitle(service, locale) : id;
            })
            .join(", ");
          if (!window.confirm(t("formAssignSaveConfirm", { services: names }))) {
            event.preventDefault();
          }
        }
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      {form ? <input type="hidden" name="formId" value={form.id} /> : null}
      <input type="hidden" name="serviceIds" value={JSON.stringify(serviceIds)} />
      <input type="hidden" name="fields" value={JSON.stringify(payload)} />

      <div className="space-y-2">
        <Label htmlFor="booking-form-title">{t("formTitle")}</Label>
        <Input
          id="booking-form-title"
          name="title"
          required
          maxLength={80}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <ServiceCheckboxes
        locale={locale}
        services={services}
        forms={forms}
        currentFormId={form?.id}
        selected={serviceIds}
        onChange={setServiceIds}
      />

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("formBuiltinSection")}</p>
        <ul className="divide-y divide-border rounded-xl border border-border">
          {BUILTIN_QUESTIONS.map((question) => (
            <li
              key={question.key}
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
            >
              <span className="font-medium text-brand">
                {t(question.labelKey)} *
              </span>
              <span className="text-xs text-muted-foreground">
                {t("formBuiltinLocked")}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">{t("formExtraSection")}</p>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">{t("formQuickAdd")}</p>
          <div className="flex flex-wrap gap-1.5">
            {BOOKING_FORM_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40"
                onClick={() => addPreset(preset)}
              >
                {t(preset.labelKey)}
              </button>
            ))}
          </div>
        </div>
        {drafts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("bookingFormEmpty")}</p>
        ) : (
          <ul className="space-y-3">
            {drafts.map((field) => (
              <li
                key={field.clientId}
                className="min-w-0 space-y-3 rounded-xl border border-border p-3"
              >
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label>{t("formFieldLabel")}</Label>
                    <Input
                      value={field.label}
                      maxLength={80}
                      required
                      onChange={(event) => {
                        const next = event.target.value;
                        updateDraft(field.clientId, {
                          label: next,
                          fieldKey: field.persisted || field.keyTouched
                            ? field.fieldKey
                            : slugFromFieldLabel(next),
                        });
                      }}
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label>{t("formFieldType")}</Label>
                    {isCompositeFieldType(field.fieldType) ? (
                      <p className="flex h-10 items-center rounded-xl border border-border/80 bg-canvas px-3 text-sm text-muted-foreground">
                        {t(`formFieldTypes.${field.fieldType}`)}
                      </p>
                    ) : (
                      <select
                        value={field.fieldType}
                        disabled={field.persisted}
                        onChange={(event) =>
                          updateDraft(field.clientId, {
                            fieldType: event.target
                              .value as BookingFormFieldType,
                          })
                        }
                        className="h-10 w-full min-w-0 rounded-xl border border-input bg-surface px-3 text-sm disabled:opacity-60"
                      >
                        {BOOKING_FORM_FIELD_TYPES.filter(
                          (type) => !isCompositeFieldType(type),
                        ).map((type) => (
                          <option key={type} value={type}>
                            {t(`formFieldTypes.${type}`)}
                          </option>
                        ))}
                      </select>
                    )}
                    {isCompositeFieldType(field.fieldType) ? (
                      <p className="text-xs text-muted-foreground">
                        {t(`formCompositeHint.${field.fieldType}`)}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label>{t("formFieldKey")}</Label>
                    <Input
                      value={field.fieldKey}
                      maxLength={40}
                      disabled={field.persisted}
                      onChange={(event) =>
                        updateDraft(field.clientId, {
                          fieldKey: event.target.value.toLowerCase(),
                          keyTouched: true,
                        })
                      }
                    />
                    <p className="break-all text-xs text-muted-foreground">
                      {t("formFieldKeyHelp", {
                        token: `{{${field.fieldKey || "variable"}}}`,
                      })}
                    </p>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label>{t("formFieldHelp")}</Label>
                    <Input
                      value={field.helpText}
                      maxLength={300}
                      onChange={(event) =>
                        updateDraft(field.clientId, {
                          helpText: event.target.value,
                        })
                      }
                    />
                  </div>
                </div>
                {field.fieldType === "select" ? (
                  <div className="space-y-2">
                    <Label>{t("formFieldOptions")}</Label>
                    <Textarea
                      rows={3}
                      required
                      value={field.optionsText}
                      onChange={(event) =>
                        updateDraft(field.clientId, {
                          optionsText: event.target.value,
                        })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("formFieldOptionsHelp")}
                    </p>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(event) =>
                        updateDraft(field.clientId, {
                          required: event.target.checked,
                        })
                      }
                      className="size-4 rounded border-input"
                    />
                    {t("formFieldRequired")}
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setDrafts((prev) =>
                        prev.filter((item) => item.clientId !== field.clientId),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                    {t("formFieldRemove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {drafts.length < MAX_BOOKING_FORM_FIELDS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setDrafts((prev) => [
                ...prev,
                {
                  clientId: newClientId(),
                  persisted: false,
                  label: "",
                  fieldKey: "",
                  helpText: "",
                  fieldType: "text",
                  optionsText: "",
                  required: false,
                  keyTouched: false,
                },
              ])
            }
          >
            <Plus className="size-4" />
            {t("newFormField")}
          </Button>
        ) : null}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("formFieldBack")}
        </Button>
        <Button type="submit" disabled={pending || serviceIds.length === 0}>
          {pending ? t("saving") : form ? t("formSave") : t("formCreate")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ServiceBookingFormButton({
  locale,
  services,
  forms,
  formFields,
  canManage,
}: {
  locale: string;
  services: BookingServiceRow[];
  forms: BookingFormRow[];
  formFields: BookingFormFieldRow[];
  canManage: boolean;
}) {
  const t = useTranslations("services");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BookingFormRow | null>(null);
  const fieldsByForm = useMemo(() => {
    const map = new Map<string, BookingFormFieldRow[]>();
    for (const field of formFields) {
      const list = map.get(field.form_id) ?? [];
      list.push(field);
      map.set(field.form_id, list);
    }
    return map;
  }, [formFields]);

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
        <ClipboardList className="size-4" />
        {t("bookingForm")}
        {forms.length > 0 ? ` (${forms.length})` : null}
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
                  ? t("editFormTitle")
                  : t("newFormTitle")
                : t("bookingFormTitle")}
            </DialogTitle>
            <DialogDescription>
              {creating || editing
                ? t("formEditorSubtitle")
                : t("formsSubtitle")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-x-hidden overflow-y-auto pr-1">
            {creating || editing ? (
              <FormEditor
                locale={locale}
                services={services}
                forms={forms}
                form={editing ?? undefined}
                fields={
                  editing ? (fieldsByForm.get(editing.id) ?? []) : []
                }
                onCancel={closeEditor}
              />
            ) : (
              <div className="space-y-4">
                {forms.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("formsEmpty")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {forms.map((form) => {
                      const assigned = services.filter(
                        (service) => service.form_id === form.id,
                      );
                      return (
                        <li
                          key={form.id}
                          className="rounded-xl border border-border px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-brand">
                                {form.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {assigned.length === 0
                                  ? t("noneAssigned")
                                  : assigned
                                      .map((service) => serviceTitle(service, locale))
                                      .join(", ")}
                                {" · "}
                                {t("formFieldCount", {
                                  count: fieldsByForm.get(form.id)?.length ?? 0,
                                })}
                              </p>
                            </div>
                            {canManage ? (
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setEditing(form)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={async () => {
                                    if (!window.confirm(t("formDeleteConfirm"))) {
                                      return;
                                    }
                                    const result = await deleteBookingFormAction(
                                      form.id,
                                      locale,
                                    );
                                    if (result.error) {
                                      toast.error(t(`errors.${result.error}`));
                                    } else {
                                      toast.success(t("formDeleted"));
                                    }
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            ) : null}
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
                      setCreating(true);
                    }}
                  >
                    <Plus className="size-4" />
                    {t("newForm")}
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
