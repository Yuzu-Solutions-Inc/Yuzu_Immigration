"use client";

import {
  MailingAddressFieldGroup,
  PassportFieldGroup,
  PhoneInlineFieldGroup,
} from "@/components/forms/contact-field-groups";
import { compositeSubInputName } from "@/lib/booking/composite-fields";
import type { BookingFormFieldRow } from "@/lib/booking/types";

type CompositeFieldProps = {
  field: BookingFormFieldRow;
  locale: string;
};

export function BookingCompositeField({ field, locale }: CompositeFieldProps) {
  const binding = {
    idPrefix: `booking-${field.field_key}`,
    getName: (key: string) => compositeSubInputName(field.field_key, key),
    getValue: () => "",
    required: field.required,
    optionsLocale: locale,
  };
  const help = field.help_text ?? null;

  if (field.field_type === "address") {
    return (
      <MailingAddressFieldGroup
        title={field.label}
        help={help}
        binding={binding}
      />
    );
  }

  if (field.field_type === "phone_contact") {
    return (
      <PhoneInlineFieldGroup
        title={field.label}
        help={help}
        binding={binding}
      />
    );
  }

  if (field.field_type === "passport") {
    return (
      <PassportFieldGroup title={field.label} help={help} binding={binding} />
    );
  }

  return null;
}
