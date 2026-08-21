"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  updateAccountRepAction,
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
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { resolveCountryLic } from "@/lib/ircc/codes/resolve-lic";
import {
  QUESTIONNAIRE_LOVS,
  fieldOptionLabel,
  orderedFieldOptions,
} from "@/lib/ircc/fields";
import type { AccountRepRequiredFormKey } from "@/lib/ircc/account-rep";
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
  required,
  invalid,
  error,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  type?: "text" | "email" | "tel";
  maxLength?: number;
  placeholder?: string;
  className?: string;
  required?: boolean;
  invalid?: boolean;
  error?: string | null;
}) {
  const errorId = `${id}-error`;
  return (
    <Field density="compact" className={className}>
      <FieldLabel htmlFor={id} density="compact" required={required}>
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
        aria-invalid={invalid || undefined}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <FieldError id={errorId} className="text-xs">
          {error}
        </FieldError>
      ) : null}
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

function actionErrorMessage(
  t: ReturnType<typeof useTranslations>,
  error: string | undefined,
) {
  if (!error) return null;
  return (
    {
      invalid: t("errors.invalid"),
      save_failed: t("errors.saveFailed"),
    }[error] ?? t("errors.generic")
  );
}

function AccountProfileForm({
  locale,
  email,
  fullName,
  canChangePassword,
}: {
  locale: AppLocale;
  email: string;
  fullName: string;
  canChangePassword: boolean;
}) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState(
    updateAccountSettingsAction,
    initial,
  );
  const nameInvalid = state.fieldErrors?.fullName === "required";
  const error = actionErrorMessage(t, state.error);

  useEffect(() => {
    if (state.success) toast.success(t("saved"));
    if (state.error) toast.error(actionErrorMessage(t, state.error) ?? t("errors.generic"));
  }, [state, t]);

  return (
    <FormStack action={action} gap="loose">
      <input type="hidden" name="locale" value={locale} />

      <section className="scroll-mt-6 space-y-4" id="account">
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
            maxLength={120}
            aria-invalid={nameInvalid || undefined}
          />
          {nameInvalid ? <FieldError>{t("fieldRequired")}</FieldError> : null}
        </Field>
      </section>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </FormStack>
  );
}

function RepresentativeSettingsForm({
  locale,
  email,
  representative,
  representativeComplete,
}: {
  locale: AppLocale;
  email: string;
  representative: AccountRepValues;
  representativeComplete: boolean;
}) {
  const t = useTranslations("settings");
  const tf = useTranslations("forms");
  const uiLocale = useLocale();
  const missingRef = useRef<HTMLDivElement>(null);
  const [state, action, pending] = useActionState(
    updateAccountRepAction,
    initial,
  );
  const [editing, setEditing] = useState(!representativeComplete);
  const values = state.repValues ?? representative;
  const [repCountry, setRepCountry] = useState(() =>
    countryLic(values.repCountry),
  );

  const savedComplete = state.success
    ? Boolean(state.repComplete)
    : representativeComplete;
  const showForm = editing || !savedComplete;
  const missing = state.missingRepFields ?? [];
  const fieldErrors = state.fieldErrors ?? {};
  const emailRequired = email.trim().length === 0;
  const error = actionErrorMessage(t, state.error);

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

  useEffect(() => {
    if (state.success) {
      if (state.repComplete) {
        toast.success(t("repSavedComplete"));
        setEditing(false);
      } else {
        toast.success(t("repSavedIncomplete"));
      }
    } else if (state.error) {
      toast.error(error ?? t("errors.generic"));
    }
  }, [state, t, error]);

  useEffect(() => {
    if (state.success && missing.length > 0) {
      missingRef.current?.focus();
    }
  }, [state, missing.length]);

  function fieldMessage(key: AccountRepRequiredFormKey): string | null {
    if (fieldErrors[key] === "invalid" && key === "repEmail") {
      return t("errors.repEmailInvalid");
    }
    if (fieldErrors[key] === "required" || missing.includes(key)) {
      return t("fieldRequired");
    }
    return null;
  }

  function fieldInvalid(key: AccountRepRequiredFormKey) {
    return Boolean(fieldMessage(key));
  }

  if (!showForm) {
    return (
      <section className="scroll-mt-6" id="representative">
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas/40 px-4 py-3">
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("repFilledTitle")}
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setRepCountry(countryLic(values.repCountry));
              setEditing(true);
            }}
          >
            {t("repEdit")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <FormStack action={action} gap="loose">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="repCountry" value={repCountry} />

      <section className="scroll-mt-6 space-y-4" id="representative">
        <div>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("repTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("repHelp")}</p>
        </div>

        {missing.length > 0 ? (
          <div
            ref={missingRef}
            tabIndex={-1}
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 outline-none"
          >
            <p className="text-sm font-medium text-destructive">
              {t("repMissingTitle")}
            </p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-destructive">
              {missing.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="repFamilyName" required>
              {t("repFamilyName")}
            </FieldLabel>
            <Input
              id="repFamilyName"
              name="repFamilyName"
              defaultValue={values.repFamilyName}
              maxLength={80}
              aria-invalid={fieldInvalid("repFamilyName") || undefined}
            />
            {fieldMessage("repFamilyName") ? (
              <FieldError>{fieldMessage("repFamilyName")}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="repGivenName" required>
              {t("repGivenName")}
            </FieldLabel>
            <Input
              id="repGivenName"
              name="repGivenName"
              defaultValue={values.repGivenName}
              maxLength={80}
              aria-invalid={fieldInvalid("repGivenName") || undefined}
            />
            {fieldMessage("repGivenName") ? (
              <FieldError>{fieldMessage("repGivenName")}</FieldError>
            ) : null}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="repOrganization" required>
              {t("repOrganization")}
            </FieldLabel>
            <Input
              id="repOrganization"
              name="repOrganization"
              defaultValue={values.repOrganization}
              maxLength={120}
              aria-invalid={fieldInvalid("repOrganization") || undefined}
            />
            {fieldMessage("repOrganization") ? (
              <FieldError>{fieldMessage("repOrganization")}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="repMembershipId" required>
              {t("repMembershipId")}
            </FieldLabel>
            <Input
              id="repMembershipId"
              name="repMembershipId"
              defaultValue={values.repMembershipId}
              maxLength={40}
              aria-invalid={fieldInvalid("repMembershipId") || undefined}
            />
            {fieldMessage("repMembershipId") ? (
              <FieldError>{fieldMessage("repMembershipId")}</FieldError>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="repEmail" required={emailRequired}>
              {t("repEmail")}
            </FieldLabel>
            <Input
              id="repEmail"
              name="repEmail"
              type="email"
              defaultValue={values.repEmail}
              aria-invalid={fieldInvalid("repEmail") || undefined}
            />
            {fieldMessage("repEmail") ? (
              <FieldError>{fieldMessage("repEmail")}</FieldError>
            ) : !emailRequired ? (
              <FieldHint>{t("repEmailHelp")}</FieldHint>
            ) : null}
          </Field>
        </FieldGrid>

        <FieldGroup title={tf("groups.phone")} required variant="inline">
          <CompactField
            id="repPhoneCountryCode"
            name="repPhoneCountryCode"
            label={tf("fields.phoneCode")}
            defaultValue={values.repPhoneCountryCode}
            type="tel"
            maxLength={6}
            placeholder="+"
            className="w-[5.25rem] shrink-0"
            required
            invalid={fieldInvalid("repPhoneCountryCode")}
            error={fieldMessage("repPhoneCountryCode")}
          />
          <CompactField
            id="repPhone"
            name="repPhone"
            label={tf("fields.phoneNumber")}
            defaultValue={values.repPhone}
            type="tel"
            maxLength={40}
            className="min-w-0 flex-1"
            required
            invalid={fieldInvalid("repPhone")}
            error={fieldMessage("repPhone")}
          />
        </FieldGroup>

        <FieldGroup title={tf("groups.mailingAddress")} required variant="boxed">
          <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3">
            <CompactField
              id="repStreetNum"
              name="repStreetNum"
              label={tf("fields.streetNum")}
              defaultValue={values.repStreetNum}
              maxLength={20}
              required
              invalid={fieldInvalid("repStreetNum")}
              error={fieldMessage("repStreetNum")}
            />
            <CompactField
              id="repStreetName"
              name="repStreetName"
              label={tf("fields.streetName")}
              defaultValue={values.repStreetName}
              maxLength={80}
              className="sm:col-span-2"
              required
              invalid={fieldInvalid("repStreetName")}
              error={fieldMessage("repStreetName")}
            />
            <CompactField
              id="repCity"
              name="repCity"
              label={tf("tables.columns.colCity")}
              defaultValue={values.repCity}
              maxLength={80}
              required
              invalid={fieldInvalid("repCity")}
              error={fieldMessage("repCity")}
            />
            <CompactField
              id="repProvince"
              name="repProvince"
              label={tf("tables.columns.colProvince")}
              defaultValue={values.repProvince}
              maxLength={40}
              required
              invalid={fieldInvalid("repProvince")}
              error={fieldMessage("repProvince")}
            />
            <Field density="compact">
              <FieldLabel htmlFor="repCountrySelect" density="compact" required>
                {tf("tables.columns.colCountry")}
              </FieldLabel>
              <CertifiedSearchSelect
                id="repCountrySelect"
                value={repCountry}
                onChange={setRepCountry}
                options={countryOptions}
                placeholder={tf("selectPlaceholder")}
                compact
                required
                invalid={fieldInvalid("repCountry")}
                label={tf("tables.columns.colCountry")}
                noMatchLabel={tf("noCertifiedMatch")}
                refineLabel={tf("refineCertifiedSearch")}
              />
              {fieldMessage("repCountry") ? (
                <FieldError className="text-xs">
                  {fieldMessage("repCountry")}
                </FieldError>
              ) : null}
            </Field>
            <CompactField
              id="repPostalCode"
              name="repPostalCode"
              label={tf("fields.postalCode")}
              defaultValue={values.repPostalCode}
              maxLength={20}
              required
              invalid={fieldInvalid("repPostalCode")}
              error={fieldMessage("repPostalCode")}
            />
          </div>
        </FieldGroup>
      </section>

      {state.error === "save_failed" ? <FieldError>{error}</FieldError> : null}

      <div className="flex flex-wrap gap-2">
        {savedComplete ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              setRepCountry(countryLic(values.repCountry));
              setEditing(false);
            }}
          >
            {t("repCancel")}
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </FormStack>
  );
}

export function AccountSettingsForm({
  locale,
  email,
  fullName,
  canChangePassword = false,
  representative,
  representativeComplete,
}: {
  locale: AppLocale;
  email: string;
  fullName: string;
  canChangePassword?: boolean;
  representative: AccountRepValues;
  representativeComplete: boolean;
}) {
  return (
    <div className="space-y-8">
      <AccountProfileForm
        locale={locale}
        email={email}
        fullName={fullName}
        canChangePassword={canChangePassword}
      />
      <RepresentativeSettingsForm
        locale={locale}
        email={email}
        representative={representative}
        representativeComplete={representativeComplete}
      />
    </div>
  );
}
