"use client";

import { useTranslations } from "next-intl";

import { CertifiedSearchSelect } from "@/components/forms/certified-search-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export const compactControlClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-surface px-2 py-0 text-sm md:text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

export const defaultSelectClass =
  "h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

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
  const selectClass = compact ? compactControlClass : defaultSelectClass;
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
      <select
        id={id}
        name={name}
        value={native ? undefined : value}
        defaultValue={native ? "" : undefined}
        onChange={native ? undefined : (e) => onChange?.(e.target.value)}
        required={required}
        aria-label={compact ? label : undefined}
        className={selectClass}
      >
        <option value="" disabled={!native && Boolean(value)}>
          {placeholder ?? t("selectPlaceholder")}
        </option>
        {selectOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {fieldOptionLabel(opt, optionsLocale, t)}
          </option>
        ))}
      </select>
    ) : type === "yesno" ? (
      <select
        id={id}
        name={name}
        value={native ? undefined : value}
        defaultValue={native ? "" : undefined}
        onChange={native ? undefined : (e) => onChange?.(e.target.value)}
        aria-label={compact ? label : undefined}
        className={selectClass}
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
      </select>
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
          className="size-4 rounded border-input"
        />
        {compact ? null : t("options.yes")}
      </label>
    ) : type === "textarea" ? (
      <Textarea
        id={id}
        name={name}
        value={native ? undefined : value}
        defaultValue={native ? "" : undefined}
        maxLength={maxLength}
        onChange={native ? undefined : (e) => onChange?.(e.target.value)}
        required={required}
        rows={compact ? 2 : 3}
        aria-label={compact ? label : undefined}
        placeholder={placeholder}
        className={compact ? "min-h-9 rounded-lg px-2 py-1.5 text-sm" : "rounded-xl"}
      />
    ) : (
      <Input
        id={id}
        name={name}
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
        className={compact ? compactControlClass : undefined}
      />
    );

  if (compact) {
    return (
      <div className="min-w-0 space-y-1">
        <Label
          htmlFor={id}
          className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </Label>
        {control}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="inline-flex items-center">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
        {help ? <HelpTip text={help} /> : null}
      </Label>
      {control}
    </div>
  );
}
