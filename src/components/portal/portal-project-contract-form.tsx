"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  submitPortalProjectContractFormAction,
  type PortalContractFormState,
} from "@/app/actions/portal-project-contract";
import { BookingCompositeField } from "@/components/booking/booking-composite-field";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel, FormStack } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { isCompositeFieldType } from "@/lib/booking/composite-fields";
import { formFieldInputName } from "@/lib/booking/form-fields";
import type { BookingFormFieldRow } from "@/lib/booking/types";

const initialState: PortalContractFormState = {};

export function PortalProjectContractForm({
  locale,
  projectId,
  contractId,
  formTitle,
  fields,
}: {
  locale: string;
  projectId: string;
  contractId: string;
  formTitle: string;
  fields: BookingFormFieldRow[];
}) {
  const t = useTranslations("portal.contractGate");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    submitPortalProjectContractFormAction,
    initialState,
  );

  useEffect(() => {
    if (state.message === "submitted") {
      toast.success(t("formSubmitted"));
      router.refresh();
    }
    if (state.error) toast.error(t(`errors.${state.error}`));
  }, [state, t, router]);

  return (
    <FormStack action={formAction} gap="default" className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="contractId" value={contractId} />

      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {formTitle}
        </h2>
        <p className="text-sm text-muted-foreground">{t("formSubtitle")}</p>
      </div>

      {fields.map((field) => (
        <PortalContractField key={field.id} field={field} locale={locale} />
      ))}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("formSubmitting") : t("formContinue")}
      </Button>
    </FormStack>
  );
}

function PortalContractField({
  field,
  locale,
}: {
  field: BookingFormFieldRow;
  locale: string;
}) {
  if (isCompositeFieldType(field.field_type)) {
    return <BookingCompositeField field={field} locale={locale} />;
  }

  const name = formFieldInputName(field.field_key);
  const hint = field.help_text ? <FieldHint>{field.help_text}</FieldHint> : null;

  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-start gap-2 text-sm leading-relaxed">
        <input
          id={name}
          type="checkbox"
          name={name}
          value="on"
          required={field.required}
          className="mt-1 size-4 rounded border-input"
        />
        <span>
          {field.label}
          {field.required ? " *" : ""}
          {hint}
        </span>
      </label>
    );
  }

  if (field.field_type === "textarea") {
    return (
      <Field>
        <FieldLabel htmlFor={name} required={field.required}>
          {field.label}
        </FieldLabel>
        <Textarea
          id={name}
          name={name}
          rows={3}
          required={field.required}
          maxLength={2000}
        />
        {hint}
      </Field>
    );
  }

  if (field.field_type === "select") {
    return (
      <Field>
        <FieldLabel htmlFor={name} required={field.required}>
          {field.label}
        </FieldLabel>
        <NativeSelect
          id={name}
          name={name}
          required={field.required}
          defaultValue=""
        >
          <option value="" disabled>
            —
          </option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
        {hint}
      </Field>
    );
  }

  const inputType =
    field.field_type === "email"
      ? "email"
      : field.field_type === "phone"
        ? "tel"
        : field.field_type === "number"
          ? "number"
          : field.field_type === "date"
            ? "date"
            : "text";

  return (
    <Field>
      <FieldLabel htmlFor={name} required={field.required}>
        {field.label}
      </FieldLabel>
      <Input
        id={name}
        name={name}
        type={inputType}
        required={field.required}
        maxLength={field.field_type === "text" ? 300 : undefined}
      />
      {hint}
    </Field>
  );
}
