"use client";

import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createServiceFormFieldAction,
  deleteServiceFormFieldAction,
  updateServiceFormFieldAction,
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
  slugFromFieldLabel,
} from "@/lib/booking/form-fields";
import type { BookingServiceFormFieldRow } from "@/lib/booking/types";

const initialState: FormFieldActionState = {};

function FieldForm({
  locale,
  serviceId,
  field,
  onCancel,
}: {
  locale: string;
  serviceId: string;
  field?: BookingServiceFormFieldRow;
  onCancel: () => void;
}) {
  const t = useTranslations("services");
  const [label, setLabel] = useState(field?.label ?? "");
  const [fieldKey, setFieldKey] = useState(field?.field_key ?? "");
  const [fieldType, setFieldType] = useState(field?.field_type ?? "text");
  const [keyTouched, setKeyTouched] = useState(Boolean(field));
  const action = field
    ? updateServiceFormFieldAction
    : createServiceFormFieldAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.message === "created" || state.message === "saved") {
      toast.success(
        t(state.message === "created" ? "formFieldCreated" : "formFieldSaved"),
      );
      onCancel();
    }
    if (state.error) toast.error(t(`errors.${state.error}`));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="serviceId" value={serviceId} />
      {field ? <input type="hidden" name="fieldId" value={field.id} /> : null}
      <div className="space-y-2">
        <Label htmlFor="form-field-label">{t("formFieldLabel")}</Label>
        <Input
          id="form-field-label"
          name="label"
          required
          maxLength={80}
          value={label}
          onChange={(event) => {
            const next = event.target.value;
            setLabel(next);
            if (!field && !keyTouched) setFieldKey(slugFromFieldLabel(next));
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-field-key">{t("formFieldKey")}</Label>
        <Input
          id="form-field-key"
          name="fieldKey"
          required={!field}
          maxLength={40}
          value={fieldKey}
          disabled={Boolean(field)}
          onChange={(event) => {
            setKeyTouched(true);
            setFieldKey(event.target.value.toLowerCase());
          }}
        />
        <p className="text-xs text-muted-foreground">
          {t("formFieldKeyHelp", { token: `{{${fieldKey || "variable"}}}` })}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="form-field-type">{t("formFieldType")}</Label>
        <select
          id="form-field-type"
          name="fieldType"
          disabled={Boolean(field)}
          value={fieldType}
          onChange={(event) =>
            setFieldType(
              event.target.value as (typeof BOOKING_FORM_FIELD_TYPES)[number],
            )
          }
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-sm"
        >
          {BOOKING_FORM_FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`formFieldTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>
      {fieldType === "select" ? (
        <div className="space-y-2">
          <Label htmlFor="form-field-options">{t("formFieldOptions")}</Label>
          <Textarea
            id="form-field-options"
            name="options"
            rows={4}
            defaultValue={(field?.options ?? []).join("\n")}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("formFieldOptionsHelp")}
          </p>
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="form-field-help">{t("formFieldHelp")}</Label>
        <Input
          id="form-field-help"
          name="helpText"
          maxLength={300}
          defaultValue={field?.help_text ?? ""}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="required"
          defaultChecked={field?.required ?? false}
          className="size-4 rounded border-input"
        />
        {t("formFieldRequired")}
      </label>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("formFieldBack")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending
            ? t("saving")
            : field
              ? t("formFieldSave")
              : t("formFieldCreate")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ServiceBookingFormButton({
  locale,
  serviceId,
  serviceTitle,
  fields,
  canManage,
}: {
  locale: string;
  serviceId: string;
  serviceTitle: string;
  fields: BookingServiceFormFieldRow[];
  canManage: boolean;
}) {
  const t = useTranslations("services");
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<BookingServiceFormFieldRow | null>(
    null,
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setCreating(false);
          setEditing(null);
          setOpen(true);
        }}
      >
        <ClipboardList className="size-4" />
        {t("bookingForm")}
        {fields.length > 0 ? ` (${fields.length})` : null}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg" showCloseButton>
          <DialogHeader>
            <DialogTitle>{t("bookingFormTitle")}</DialogTitle>
            <DialogDescription>
              {t("bookingFormSubtitle", { service: serviceTitle })}
            </DialogDescription>
          </DialogHeader>
          {creating || editing ? (
            <FieldForm
              locale={locale}
              serviceId={serviceId}
              field={editing ?? undefined}
              onCancel={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          ) : (
            <div className="space-y-4">
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("bookingFormEmpty")}
                </p>
              ) : (
                <ul className="space-y-2">
                  {fields.map((field) => (
                    <li
                      key={field.id}
                      className="rounded-xl border border-border px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-brand">
                            {field.label}
                            {field.required ? " *" : ""}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {`{{${field.field_key}}}`}
                            {" · "}
                            {t(`formFieldTypes.${field.field_type}`)}
                          </p>
                        </div>
                        {canManage ? (
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setEditing(field)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={async () => {
                                if (!window.confirm(t("formFieldDeleteConfirm"))) {
                                  return;
                                }
                                const result = await deleteServiceFormFieldAction(
                                  field.id,
                                  locale,
                                );
                                if (result.error) {
                                  toast.error(t(`errors.${result.error}`));
                                } else {
                                  toast.success(t("formFieldDeleted"));
                                }
                              }}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
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
                  {t("newFormField")}
                </Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
