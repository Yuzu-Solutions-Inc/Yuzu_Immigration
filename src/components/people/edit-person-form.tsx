"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updatePersonAction,
  type UpdatePersonState,
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

const initialState: UpdatePersonState = {};

export function EditPersonForm({
  locale,
  person,
}: {
  locale: "en" | "fr";
  person: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    preferred_locale: string;
    immigration_status: PersonImmigrationStatus;
    status_expires_at: string | null;
  };
}) {
  const t = useTranslations("people");
  const ti = useTranslations("immigrationStatus");
  const [immigrationStatus, setImmigrationStatus] =
    useState<PersonImmigrationStatus>(person.immigration_status);
  const [statusExpiresAt, setStatusExpiresAt] = useState(
    person.status_expires_at ?? "",
  );
  const [state, formAction, pending] = useActionState(
    updatePersonAction,
    initialState,
  );

  const expiryEnabled = personStatusAllowsExpiry(immigrationStatus);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        update_failed: t("errors.updateFailed"),
        not_found: t("errors.notFound"),
        trial_expired: t("errors.trialExpired"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <FormStack action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="personId" value={person.id} />
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
          <Input
            id="firstName"
            name="firstName"
            defaultValue={person.first_name}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="lastName" required>
            {t("lastName")}
          </FieldLabel>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={person.last_name}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="email">{t("emailOptional")}</FieldLabel>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={person.email ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="phone">{t("phoneOptional")}</FieldLabel>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={person.phone ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="preferredLocale">{t("preferredLocale")}</FieldLabel>
          <NativeSelect
            id="preferredLocale"
            name="preferredLocale"
            defaultValue={
              person.preferred_locale === "fr"
                ? "fr"
                : person.preferred_locale === "es"
                  ? "es"
                  : "en"
            }
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
        {pending ? t("saving") : t("save")}
      </Button>
    </FormStack>
  );
}
