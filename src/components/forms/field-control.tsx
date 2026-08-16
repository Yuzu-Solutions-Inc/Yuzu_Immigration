"use client";

import { useTranslations } from "next-intl";

import { CertifiedSearchSelect } from "@/components/forms/certified-search-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { fieldControlClassName } from "@/lib/field-styles";
import {
  fieldOptionLabel,
  orderedFieldOptions,
  type CanonicalField,
  type FieldOption,
  type TableColumn,
} from "@/lib/ircc/fields";

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground hover:bg-muted"
        aria-label={text}
      >
        ?
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-normal text-brand shadow-elevated group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

export const compactControlClass = fieldControlClassName({ density: "compact" });

export const defaultSelectClass = fieldControlClassName({
  density: "default",
  control: "select",
});

export function FieldControl({
  id,
  label,
  help,
  type,
  value,
  onChange,
  required,
  maxLength,
  options,
  t,
  optionsLocale,
  compact,
  placeholder,
  name,
}: {
  id: string;
  label: string;
  help?: string | null;
  type: CanonicalField["type"] | TableColumn["type"];
  value: string;
  onChange?: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  options?: FieldOption[];
  t: ReturnType<typeof useTranslations>;
  optionsLocale: string;
  compact?: boolean;
  placeholder?: string;
  /** Native form field name — renders uncontrolled inputs for FormData submit. */
  name?: string;
}) {
  const native = Boolean(name);
  const density = compact ? "compact" : "default";
  const selectOptions = options
    ? orderedFieldOptions(options, optionsLocale, t)
    : [];
  const labeledOptions = selectOptions.map((opt) => ({
    value: opt.value,
    label: fieldOptionLabel(opt, optionsLocale, t),
  }));
  const searchable = type === "select" && labeledOptions.length > 5;

  const control =
    searchable && !native ? (
      <CertifiedSearchSelect
        id={id}
        value={value}
        onChange={(next) => onChange?.(next)}
        options={labeledOptions}
        placeholder={placeholder ?? t("selectPlaceholder")}
        required={required}
        compact={compact}
        label={label}
        noMatchLabel={t("noCertifiedMatch")}
        refineLabel={t("refineCertifiedSearch")}
      />
    ) : type === "select" ? (
      <NativeSelect
        id={id}
        name={name}
        density={density}
        value={native ? undefined : value}
        defaultValue={native ? "" : undefined}
        onChange={native ? undefined : (e) => onChange?.(e.target.value)}
        required={required}
        aria-label={compact ? label : undefined}
      >
        <option value="" disabled={!native && Boolean(value)}>
          {placeholder ?? t("selectPlaceholder")}
        </option>
        {selectOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {fieldOptionLabel(opt, optionsLocale, t)}
          </option>
        ))}
      </NativeSelect>
    ) : type === "yesno" ? (
      <NativeSelect
        id={id}
        name={name}
        density={density}
        value={native ? undefined : value}
        defaultValue={native ? "" : undefined}
        onChange={native ? undefined : (e) => onChange?.(e.target.value)}
        aria-label={compact ? label : undefined}
      >
        <option value="" disabled={!native && Boolean(value)}>
          {placeholder ?? t("selectPlaceholder")}
        </option>
        <option value="Y">
          {optionsLocale.startsWith("fr") ? "Oui" : t("options.yes")}
        </option>
        <option value="N">
          {optionsLocale.startsWith("fr") ? "Non" : t("options.no")}
        </option>
      </NativeSelect>
    ) : type === "checkbox" ? (
      <label className="flex h-9 items-center justify-center gap-2 text-sm text-brand">
        <input
          id={id}
          name={name}
          type="checkbox"
          checked={native ? undefined : value === "Y"}
          defaultChecked={native ? false : undefined}
          onChange={
            native
              ? undefined
              : (e) => onChange?.(e.target.checked ? "Y" : "N")
          }
          aria-label={compact ? label : undefined}
          className={fieldControlClassName({ control: "checkbox" })}
        />
        {compact ? null : t("options.yes")}
      </label>
    ) : type === "textarea" ? (
      <Textarea
        id={id}
        name={name}
        density={density}
        value={native ? undefined : value}
        defaultValue={native ? "" : undefined}
        maxLength={maxLength}
        onChange={native ? undefined : (e) => onChange?.(e.target.value)}
        required={required}
        rows={compact ? 2 : 3}
        aria-label={compact ? label : undefined}
        placeholder={placeholder}
      />
    ) : (
      <Input
        id={id}
        name={name}
        density={density}
        type={
          type === "email"
            ? "email"
            : type === "tel"
              ? "tel"
              : type === "date"
                ? "date"
                : type === "month"
                  ? "month"
                  : "text"
        }
        value={native ? undefined : value}
        defaultValue={native ? "" : undefined}
        maxLength={maxLength}
        onChange={native ? undefined : (e) => onChange?.(e.target.value)}
        required={required}
        aria-label={compact ? label : undefined}
        placeholder={placeholder}
      />
    );

  return (
    <Field density={density}>
      <FieldLabel htmlFor={id} density={density} required={required}>
        {label}
        {!compact && help ? <HelpTip text={help} /> : null}
      </FieldLabel>
      {control}
    </Field>
  );
}
