"use client";

import { useTranslations } from "next-intl";

import { FieldControl } from "@/components/forms/field-control";
import { FieldGroup } from "@/components/ui/field";
import {
  canonicalFieldsByKeys,
  contactFieldGridSpan,
  contactFieldInlineClass,
  contactFieldLabel,
  MAILING_ADDRESS_FIELD_KEYS,
  PASSPORT_FIELD_KEYS,
  PHONE_CONTACT_FIELD_KEYS,
} from "@/lib/forms/contact-fields";
import type { CanonicalField } from "@/lib/ircc/fields";

export type ContactFieldBinding = {
  idPrefix: string;
  getName?: (key: string) => string;
  getValue: (key: string) => string;
  onChange?: (key: string, value: string) => void;
  required?: boolean;
  optionsLocale: string;
};

function renderField(
  field: CanonicalField,
  binding: ContactFieldBinding,
  t: ReturnType<typeof useTranslations>,
  th: ReturnType<typeof useTranslations>,
  wrapperClass?: string,
) {
  const id = `${binding.idPrefix}-${field.key}`;
  const required = binding.required ?? field.required;
  return (
    <div key={field.key} className={wrapperClass}>
      <FieldControl
        id={id}
        label={contactFieldLabel(field.key, t)}
        help={field.helpKey ? th(field.helpKey) : null}
        type={field.type}
        value={binding.getValue(field.key)}
        onChange={
          binding.onChange
            ? (value) => binding.onChange?.(field.key, value)
            : undefined
        }
        name={binding.getName?.(field.key)}
        required={required}
        maxLength={field.maxLength}
        options={field.options}
        t={t}
        optionsLocale={binding.optionsLocale}
        compact
        placeholder={field.key === "phoneCountryCode" ? "+" : undefined}
      />
    </div>
  );
}

export function MailingAddressFieldGroup({
  binding,
  title,
  help,
}: {
  binding: ContactFieldBinding;
  title?: string;
  help?: string | null;
}) {
  const t = useTranslations("forms");
  const th = useTranslations("forms.help");
  const fields = canonicalFieldsByKeys(MAILING_ADDRESS_FIELD_KEYS);

  return (
    <FieldGroup title={title} hint={help} required={binding.required} variant="boxed">
      <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
        {fields.map((field) =>
          renderField(field, binding, t, th, contactFieldGridSpan(field.key)),
        )}
      </div>
    </FieldGroup>
  );
}

export function PhoneInlineFieldGroup({
  binding,
  title,
  help,
}: {
  binding: ContactFieldBinding;
  title?: string;
  help?: string | null;
}) {
  const t = useTranslations("forms");
  const th = useTranslations("forms.help");
  const fields = canonicalFieldsByKeys(PHONE_CONTACT_FIELD_KEYS);

  return (
    <FieldGroup title={title} hint={help} required={binding.required} variant="inline">
      {fields.map((field) =>
        renderField(field, binding, t, th, contactFieldInlineClass(field.key)),
      )}
    </FieldGroup>
  );
}

export function PassportFieldGroup({
  binding,
  title,
  help,
}: {
  binding: ContactFieldBinding;
  title?: string;
  help?: string | null;
}) {
  const t = useTranslations("forms");
  const th = useTranslations("forms.help");
  const fields = canonicalFieldsByKeys(PASSPORT_FIELD_KEYS);

  return (
    <FieldGroup title={title} hint={help} required={binding.required} variant="boxed">
      <div className="grid min-w-0 grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
        {fields.map((field) => renderField(field, binding, t, th))}
      </div>
    </FieldGroup>
  );
}
