"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createPersonAction,
  type CreatePersonState,
} from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import type { PersonImmigrationStatus } from "@/db/schema";
import {
  PERSON_IMMIGRATION_STATUSES,
  personStatusAllowsExpiry,
} from "@/lib/crm/person-status";
import type { AppLocale } from "@/lib/i18n/locales";

const initialState: CreatePersonState = {};

export function CreatePersonForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("people");
  const ti = useTranslations("immigrationStatus");
  const [immigrationStatus, setImmigrationStatus] =
    useState<PersonImmigrationStatus>("none");
  const [statusExpiresAt, setStatusExpiresAt] = useState("");
  const [state, formAction, pending] = useActionState(
    createPersonAction,
    initialState,
  );

  const expiryEnabled = personStatusAllowsExpiry(immigrationStatus);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        create_failed: t("errors.createFailed"),
        forbidden: t("errors.forbidden"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <FormStack action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="immigrationStatus" value={immigrationStatus} />
      <input
        type="hidden"
        name="statusExpiresAt"
        value={expiryEnabled ? statusExpiresAt : ""}
      />

      <FieldGrid>
        <Field>
          <FieldLabel htmlFor="firstName" required>
            {t("firstName")}
          </FieldLabel>
          <Input id="firstName" name="firstName" required autoFocus />
        </Field>
        <Field>
          <FieldLabel htmlFor="lastName" required>
            {t("lastName")}
          </FieldLabel>
          <Input id="lastName" name="lastName" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">{t("emailOptional")}</FieldLabel>
          <Input id="email" name="email" type="email" />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">{t("phoneOptional")}</FieldLabel>
          <Input id="phone" name="phone" type="tel" />
        </Field>
        <Field>
          <FieldLabel htmlFor="preferredLocale">{t("preferredLocale")}</FieldLabel>
          <NativeSelect
            id="preferredLocale"
            name="preferredLocale"
            defaultValue={locale}
          >
            <option value="en">{t("locales.en")}</option>
            <option value="fr">{t("locales.fr")}</option>
            <option value="es">{t("locales.es")}</option>
          </NativeSelect>
        </Field>
        <Field>
          <FieldLabel htmlFor="immigrationStatus">
            {t("immigrationStatus")}
          </FieldLabel>
          <NativeSelect
            id="immigrationStatus"
            value={immigrationStatus}
            onChange={(e) => {
              const next = e.target.value as PersonImmigrationStatus;
              setImmigrationStatus(next);
              if (!personStatusAllowsExpiry(next)) {
                setStatusExpiresAt("");
              }
            }}
          >
            {PERSON_IMMIGRATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ti(value)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="statusExpiresAt">{t("statusExpiresAt")}</FieldLabel>
          <Input
            id="statusExpiresAt"
            type="date"
            value={statusExpiresAt}
            disabled={!expiryEnabled}
            onChange={(e) => setStatusExpiresAt(e.target.value)}
          />
          <FieldHint>{t("statusExpiresAtHelp")}</FieldHint>
        </Field>
      </FieldGrid>

      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("creating") : t("create")}
      </Button>
    </FormStack>
  );
}
