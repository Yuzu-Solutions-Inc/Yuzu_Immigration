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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveCountryLic } from "@/lib/ircc/codes/resolve-lic";
import {
  QUESTIONNAIRE_LOVS,
  fieldOptionLabel,
  orderedFieldOptions,
} from "@/lib/ircc/fields";
import type { AppLocale } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

const initial: SettingsActionState = {};

const compactControlClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-surface px-2 py-0 text-sm md:text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

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
    <div className={cn("min-w-0 space-y-1", className)}>
      <Label
        htmlFor={id}
        className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </Label>
      <Input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        maxLength={maxLength}
        placeholder={placeholder}
        className={compactControlClass}
      />
    </div>
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
    <form action={action} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="repCountry" value={repCountry} />

      <section className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" value={email} disabled readOnly />
          <p className="text-xs text-muted-foreground">{t("emailHelp")}</p>
        </div>

        {canChangePassword ? <ChangePasswordForm locale={locale} /> : null}

        <div className="space-y-2">
          <Label htmlFor="fullName">{t("fullName")}</Label>
          <Input
            id="fullName"
            name="fullName"
            defaultValue={fullName}
            required
            maxLength={120}
          />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="font-heading text-base font-semibold text-brand">
            {t("repTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("repHelp")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="repFamilyName">{t("repFamilyName")}</Label>
            <Input
              id="repFamilyName"
              name="repFamilyName"
              defaultValue={representative.repFamilyName}
              maxLength={80}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repGivenName">{t("repGivenName")}</Label>
            <Input
              id="repGivenName"
              name="repGivenName"
              defaultValue={representative.repGivenName}
              maxLength={80}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="repOrganization">{t("repOrganization")}</Label>
            <Input
              id="repOrganization"
              name="repOrganization"
              defaultValue={representative.repOrganization}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repMembershipId">{t("repMembershipId")}</Label>
            <Input
              id="repMembershipId"
              name="repMembershipId"
              defaultValue={representative.repMembershipId}
              maxLength={40}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="repEmail">{t("repEmail")}</Label>
            <Input
              id="repEmail"
              name="repEmail"
              type="email"
              defaultValue={representative.repEmail}
            />
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-heading text-sm font-semibold text-brand">
            {tf("groups.phone")}
          </h4>
          <div className="flex min-w-0 gap-2">
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
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="font-heading text-sm font-semibold text-brand">
            {tf("groups.mailingAddress")}
          </h4>
          <div className="rounded-xl border border-border bg-surface px-3 py-3">
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
              <div className="min-w-0 space-y-1">
                <Label
                  htmlFor="repCountrySelect"
                  className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  {tf("tables.columns.colCountry")}
                </Label>
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
              </div>
              <CompactField
                id="repPostalCode"
                name="repPostalCode"
                label={tf("fields.postalCode")}
                defaultValue={representative.repPostalCode}
                maxLength={20}
              />
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success" role="status">
          {t("saved")}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
