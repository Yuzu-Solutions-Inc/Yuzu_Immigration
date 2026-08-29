"use client";

import type { ReactNode } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CertifiedSearchSelect } from "@/components/forms/certified-search-select";
import { fieldControlClassName } from "@/lib/field-styles";
import {
  fieldOptionsForControl,
  type CustomField,
} from "@/lib/custom-forms/schema";

export function CustomPrimitiveControl({
  id,
  field,
  label,
  value,
  onChange,
  locale,
  compact,
  required,
  searchNoMatch,
  searchRefine,
  selectPlaceholder,
}: {
  id: string;
  field: CustomField;
  label: string;
  value: string;
  onChange: (value: string) => void;
  locale: string;
  compact?: boolean;
  required?: boolean;
  searchNoMatch: string;
  searchRefine: string;
  selectPlaceholder: string;
}) {
  const density = compact ? "compact" : "default";
  const isRequired = required ?? field.required;
  const options = fieldOptionsForControl(field, locale);
  const searchable = field.type === "select" && options.length > 5;

  let control: ReactNode;
  if (searchable) {
    control = (
      <CertifiedSearchSelect
        id={id}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={selectPlaceholder}
        required={isRequired}
        compact={compact}
        label={label}
        noMatchLabel={searchNoMatch}
        refineLabel={searchRefine}
      />
    );
  } else if (field.type === "select" || field.type === "yesno") {
    control = (
      <NativeSelect
        id={id}
        density={density}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={isRequired}
      >
        <option value="">{selectPlaceholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </NativeSelect>
    );
  } else if (field.type === "checkbox") {
    control = (
      <label className="flex h-9 items-center gap-2 text-sm text-brand">
        <input
          id={id}
          type="checkbox"
          checked={value === "Y"}
          onChange={(event) => onChange(event.target.checked ? "Y" : "N")}
          className={fieldControlClassName({ control: "checkbox" })}
        />
      </label>
    );
  } else if (field.type === "textarea") {
    control = (
      <Textarea
        id={id}
        density={density}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={isRequired}
        rows={compact ? 2 : 3}
      />
    );
  } else {
    control = (
      <Input
        id={id}
        density={density}
        type={
          field.type === "email"
            ? "email"
            : field.type === "tel"
              ? "tel"
              : field.type === "date"
                ? "date"
                : field.type === "month"
                  ? "month"
                  : field.type === "number"
                    ? "number"
                    : "text"
        }
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={isRequired}
      />
    );
  }

  return (
    <Field density={density}>
      <FieldLabel htmlFor={id} density={density} required={isRequired}>
        {label}
      </FieldLabel>
      {control}
    </Field>
  );
}
