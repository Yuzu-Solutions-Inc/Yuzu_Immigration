"use client";

import { useActionState, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  updateAccountSettingsAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { CertifiedSearchSelect } from "@/components/forms/certified-search-select";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldGroup,
  FieldHint,
  FieldLabel,
  FieldSuccess,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resolveCountryLic } from "@/lib/ircc/codes/resolve-lic";
import {
  QUESTIONNAIRE_LOVS,
  fieldOptionLabel,
  orderedFieldOptions,
} from "@/lib/ircc/fields";
import type { AppLocale } from "@/lib/i18n/locales";
const initial: SettingsActionState = {};

function countryLic(value: string): string {
  const raw = value.trim() || "Canada";
  try {
    return resolveCountryLic(raw);
  } catch {
    return "";
  }
}

function CompactField({
  id,
  name,
  label,
  defaultValue,
  type = "text",
  maxLength,
  placeholder,
  className,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  type?: "text" | "email" | "tel";
  maxLength?: number;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Field density="compact" className={className}>
      <FieldLabel htmlFor={id} density="compact">
        {label}
      </FieldLabel>
      <Input
        id={id}
        name={name}
        type={type}
        density="compact"
        defaultValue={defaultValue}
        maxLength={maxLength}
        placeholder={placeholder}
      />
    </Field>
  );
}

export type AccountRepValues = {
  repFamilyName: string;
  repGivenName: string;
  repOrganization: string;
  repEmail: string;
  repPhone: string;
  repPhoneCountryCode: string;
  repMembershipId: string;
  repStreetNum: string;
  repStreetName: string;
  repCity: string;
  repProvince: string;
  repCountry: string;
  repPostalCode: string;
};

export function AccountSettingsForm({
  locale,
  email,
  fullName,
  canChangePassword = false,
  representative,
}: {
  locale: AppLocale;
  email: string;
  fullName: string;
  canChangePassword?: boolean;
  representative: AccountRepValues;
}) {
  const t = useTranslations("settings");
  const tf = useTranslations("forms");
  const uiLocale = useLocale();
  const [state, action, pending] = useActionState(
    updateAccountSettingsAction,
    initial,
  );
  const [repCountry, setRepCountry] = useState(() =>
    countryLic(representative.repCountry),
  );

  const countryOptions = useMemo(() => {
    const ordered = orderedFieldOptions(
      QUESTIONNAIRE_LOVS.country,
      uiLocale,
      (key) => tf(key),
    );
    return ordered.map((opt) => ({
      value: opt.value,
      label: fieldOptionLabel(opt, uiLocale, (key) => tf(key)),
    }));
  }, [tf, uiLocale]);

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      save_failed: t("errors.saveFailed"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <FormStack action={action} gap="loose">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="repCountry" value={repCountry} />

      <section className="space-y-4">
        <Field>
          <FieldLabel htmlFor="email">{t("email")}</FieldLabel>
          <Input id="email" value={email} disabled readOnly />
          <FieldHint>{t("emailHelp")}</FieldHint>
        </Field>

        {canChangePassword ? <ChangePasswordForm locale={locale} /> : null}

        <Field>
          <FieldLabel htmlFor="fullName" required>
            {t("fullName")}
          </FieldLabel>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={fullName}
            required
            maxLength={120}
          />
        </Field>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("repTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("repHelp")}</p>
        </div>

        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="repFamilyName">{t("repFamilyName")}</FieldLabel>
            <Input
              id="repFamilyName"
              name="repFamilyName"
              defaultValue={representative.repFamilyName}
              maxLength={80}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="repGivenName">{t("repGivenName")}</FieldLabel>
            <Input
              id="repGivenName"
              name="repGivenName"
              defaultValue={representative.repGivenName}
              maxLength={80}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="repOrganization">{t("repOrganization")}</FieldLabel>
            <Input
              id="repOrganization"
              name="repOrganization"
              defaultValue={representative.repOrganization}
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="repMembershipId">{t("repMembershipId")}</FieldLabel>
            <Input
              id="repMembershipId"
              name="repMembershipId"
              defaultValue={representative.repMembershipId}
              maxLength={40}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="repEmail">{t("repEmail")}</FieldLabel>
            <Input
              id="repEmail"
              name="repEmail"
              type="email"
              defaultValue={representative.repEmail}
            />
          </Field>
        </FieldGrid>

        <FieldGroup title={tf("groups.phone")} variant="inline">
          <CompactField
            id="repPhoneCountryCode"
            name="repPhoneCountryCode"
            label={tf("fields.phoneCode")}
            defaultValue={representative.repPhoneCountryCode}
            type="tel"
            maxLength={6}
            placeholder="+"
            className="w-[5.25rem] shrink-0"
          />
          <CompactField
            id="repPhone"
            name="repPhone"
            label={tf("fields.phoneNumber")}
            defaultValue={representative.repPhone}
            type="tel"
            maxLength={40}
            className="min-w-0 flex-1"
          />
        </FieldGroup>

        <FieldGroup title={tf("groups.mailingAddress")} variant="boxed">
          <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
            <CompactField
              id="repStreetNum"
              name="repStreetNum"
              label={tf("fields.streetNum")}
              defaultValue={representative.repStreetNum}
              maxLength={20}
            />
            <CompactField
              id="repStreetName"
              name="repStreetName"
              label={tf("fields.streetName")}
              defaultValue={representative.repStreetName}
              maxLength={80}
              className="sm:col-span-2"
            />
            <CompactField
              id="repCity"
              name="repCity"
              label={tf("tables.columns.colCity")}
              defaultValue={representative.repCity}
              maxLength={80}
            />
            <CompactField
              id="repProvince"
              name="repProvince"
              label={tf("tables.columns.colProvince")}
              defaultValue={representative.repProvince}
              maxLength={40}
            />
            <Field density="compact">
              <FieldLabel htmlFor="repCountrySelect" density="compact">
                {tf("tables.columns.colCountry")}
              </FieldLabel>
              <CertifiedSearchSelect
                id="repCountrySelect"
                value={repCountry}
                onChange={setRepCountry}
                options={countryOptions}
                placeholder={tf("selectPlaceholder")}
                compact
                label={tf("tables.columns.colCountry")}
                noMatchLabel={tf("noCertifiedMatch")}
                refineLabel={tf("refineCertifiedSearch")}
              />
            </Field>
            <CompactField
              id="repPostalCode"
              name="repPostalCode"
              label={tf("fields.postalCode")}
              defaultValue={representative.repPostalCode}
              maxLength={20}
            />
          </div>
        </FieldGroup>
      </section>

      {error ? <FieldError>{error}</FieldError> : null}
      {state.success ? <FieldSuccess>{t("saved")}</FieldSuccess> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </FormStack>
  );
}
