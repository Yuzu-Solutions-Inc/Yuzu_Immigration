"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { CustomPrimitiveControl } from "@/components/custom-forms/custom-field-control";
import {
  MailingAddressFieldGroup,
  PassportFieldGroup,
  PhoneInlineFieldGroup,
} from "@/components/forms/contact-field-groups";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  isCustomFieldVisible,
  isCustomSectionVisible,
  localizedLabel,
  type CustomField,
  type CustomFormSchema,
} from "@/lib/custom-forms/schema";
import { isGatedByParent } from "@/lib/forms/visibility";

function asRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, part] of Object.entries(value as Record<string, unknown>)) {
    out[key] = String(part ?? "");
  }
  return out;
}

function asRows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function Revealed({ children }: { children: React.ReactNode }) {
  return (
    <div className="ml-3 border-l-2 border-action/40 pl-4">{children}</div>
  );
}

export function CustomQuestionnaire({
  schema,
  answers,
  onChange,
  onSave,
  pending,
  errorMessage,
  locale,
  readOnly,
  showSave = true,
}: {
  schema: CustomFormSchema;
  answers: Record<string, unknown>;
  onChange?: (answers: Record<string, unknown>) => void;
  onSave?: (answers: Record<string, unknown>, sectionKey: string) => void;
  pending?: boolean;
  errorMessage?: string | null;
  locale: string;
  readOnly?: boolean;
  showSave?: boolean;
}) {
  const t = useTranslations("customForms");
  const tf = useTranslations("forms");
  const visibleSections = schema.sections.filter((section) =>
    isCustomSectionVisible(section, answers),
  );
  const [sectionKey, setSectionKey] = useState(
    visibleSections[0]?.key ?? schema.sections[0]?.key ?? "",
  );
  const current =
    visibleSections.find((section) => section.key === sectionKey) ??
    visibleSections[0] ??
    null;

  function setAnswer(key: string, value: unknown) {
    if (readOnly) return;
    onChange?.({ ...answers, [key]: value });
  }

  function renderField(field: CustomField, parentKey?: string) {
    if (!isCustomFieldVisible(field, answers)) return null;
    const label = localizedLabel(field.label, locale);
    const help = localizedLabel(field.help, locale);
    const gated =
      parentKey && isGatedByParent(field.showWhen, parentKey, answers);
    const id = `custom-${field.id}`;
    const nested = (
      <FieldBlock
        field={field}
        id={id}
        label={label}
        help={help}
        locale={locale}
        answers={answers}
        readOnly={readOnly}
        onChange={setAnswer}
        searchNoMatch={tf("noCertifiedMatch")}
        searchRefine={tf("refineCertifiedSearch")}
        selectPlaceholder={tf("selectPlaceholder")}
        addRowLabel={t("addRow")}
        removeRowLabel={t("removeRow")}
      />
    );
    const children = current?.fields.filter((child) =>
      isGatedByParent(child.showWhen, field.key, answers),
    );
    const body = (
      <div className="space-y-3">
        {nested}
        {children && children.length > 0 ? (
          <Revealed>
            <div className="space-y-3">
              {children.map((child) => (
                <div key={child.id}>{renderField(child, field.key)}</div>
              ))}
            </div>
          </Revealed>
        ) : null}
      </div>
    );
    if (gated) return body;
    const isChild = current?.fields.some(
      (parent) =>
        parent.key !== field.key &&
        isGatedByParent(field.showWhen, parent.key, answers),
    );
    if (isChild) return null;
    return body;
  }

  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">{t("emptyFormPreview")}</p>
    );
  }

  return (
    <div className="space-y-4">
      {visibleSections.length > 1 ? (
        <nav className="flex flex-wrap gap-2">
          {visibleSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setSectionKey(section.key)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                section.key === current.key
                  ? "border-action bg-action text-action-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-brand",
              )}
            >
              {localizedLabel(section.title, locale)}
            </button>
          ))}
        </nav>
      ) : null}

      <div className="space-y-1">
        <h3 className="font-heading text-lg font-semibold text-brand">
          {localizedLabel(current.title, locale)}
        </h3>
        {current.description ? (
          <p className="text-sm text-muted-foreground">
            {localizedLabel(current.description, locale)}
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        {current.fields.map((field) => (
          <div key={field.id}>{renderField(field)}</div>
        ))}
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {showSave && onSave && !readOnly ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() => onSave(answers, current.key)}
        >
          {pending ? t("saving") : t("save")}
        </Button>
      ) : null}
    </div>
  );
}

function FieldBlock({
  field,
  id,
  label,
  help,
  locale,
  answers,
  readOnly,
  onChange,
  searchNoMatch,
  searchRefine,
  selectPlaceholder,
  addRowLabel,
  removeRowLabel,
}: {
  field: CustomField;
  id: string;
  label: string;
  help?: string;
  locale: string;
  answers: Record<string, unknown>;
  readOnly?: boolean;
  onChange: (key: string, value: unknown) => void;
  searchNoMatch: string;
  searchRefine: string;
  selectPlaceholder: string;
  addRowLabel: string;
  removeRowLabel: string;
}) {
  const t = useTranslations("customForms");
  if (field.type === "address") {
    const nested = asRecord(answers[field.key]);
    return (
      <MailingAddressFieldGroup
        title={label}
        help={help || null}
        binding={{
          idPrefix: id,
          optionsLocale: locale,
          required: field.required,
          getValue: (key) => nested[key] ?? "",
          onChange: readOnly
            ? undefined
            : (key, value) => onChange(field.key, { ...nested, [key]: value }),
        }}
      />
    );
  }
  if (field.type === "phone_contact") {
    const nested = asRecord(answers[field.key]);
    return (
      <PhoneInlineFieldGroup
        title={label}
        help={help || null}
        binding={{
          idPrefix: id,
          optionsLocale: locale,
          required: field.required,
          getValue: (key) => nested[key] ?? "",
          onChange: readOnly
            ? undefined
            : (key, value) => onChange(field.key, { ...nested, [key]: value }),
        }}
      />
    );
  }
  if (field.type === "passport") {
    const nested = asRecord(answers[field.key]);
    return (
      <PassportFieldGroup
        title={label}
        help={help || null}
        binding={{
          idPrefix: id,
          optionsLocale: locale,
          required: field.required,
          getValue: (key) => nested[key] ?? "",
          onChange: readOnly
            ? undefined
            : (key, value) => onChange(field.key, { ...nested, [key]: value }),
        }}
      />
    );
  }
  if (field.type === "repeatable") {
    const rows = asRows(answers[field.key]);
    const columns = field.columns ?? [];
    return (
      <FieldGroup title={label} hint={help} required={field.required} variant="boxed">
        <div className="space-y-4">
          {rows.map((row, index) => (
            <div
              key={`${field.id}-${index}`}
              className="space-y-3 rounded-xl border border-border p-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("rowNumber", { n: index + 1 })}
                </p>
                {readOnly ? null : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={removeRowLabel}
                    onClick={() =>
                      onChange(
                        field.key,
                        rows.filter((_, rowIndex) => rowIndex !== index),
                      )
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {columns.map((col) => (
                  <CustomPrimitiveControl
                    key={col.id}
                    id={`${id}-${index}-${col.key}`}
                    field={col}
                    label={localizedLabel(col.label, locale)}
                    value={String(row[col.key] ?? "")}
                    onChange={(value) => {
                      if (readOnly) return;
                      const next = rows.map((item, rowIndex) =>
                        rowIndex === index ? { ...item, [col.key]: value } : item,
                      );
                      onChange(field.key, next);
                    }}
                    locale={locale}
                    compact
                    required={col.required}
                    searchNoMatch={searchNoMatch}
                    searchRefine={searchRefine}
                    selectPlaceholder={selectPlaceholder}
                  />
                ))}
              </div>
            </div>
          ))}
          {readOnly ? null : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if ((field.maxRows ?? 30) <= rows.length) return;
                onChange(field.key, [...rows, {}]);
              }}
            >
              <Plus className="size-4" />
              {addRowLabel}
            </Button>
          )}
        </div>
      </FieldGroup>
    );
  }

  return (
    <CustomPrimitiveControl
      id={id}
      field={field}
      label={label}
      value={String(answers[field.key] ?? "")}
      onChange={(value) => onChange(field.key, value)}
      locale={locale}
      compact
      required={field.required}
      searchNoMatch={searchNoMatch}
      searchRefine={searchRefine}
      selectPlaceholder={selectPlaceholder}
    />
  );
}
