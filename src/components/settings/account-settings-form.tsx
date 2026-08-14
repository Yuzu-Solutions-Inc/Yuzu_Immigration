"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  updateAccountSettingsAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/lib/i18n/locales";

const initial: SettingsActionState = {};

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
  representative,
}: {
  locale: AppLocale;
  email: string;
  fullName: string;
  representative: AccountRepValues;
}) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState(
    updateAccountSettingsAction,
    initial,
  );

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

      <section className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t("email")}</Label>
          <Input id="email" value={email} disabled readOnly />
          <p className="text-xs text-muted-foreground">{t("emailHelp")}</p>
        </div>

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
          {(
            [
              ["repFamilyName", "repFamilyName"],
              ["repGivenName", "repGivenName"],
              ["repOrganization", "repOrganization"],
              ["repMembershipId", "repMembershipId"],
              ["repEmail", "repEmail"],
              ["repPhone", "repPhone"],
              ["repPhoneCountryCode", "repPhoneCountryCode"],
              ["repStreetNum", "repStreetNum"],
              ["repStreetName", "repStreetName"],
              ["repCity", "repCity"],
              ["repProvince", "repProvince"],
              ["repCountry", "repCountry"],
              ["repPostalCode", "repPostalCode"],
            ] as const
          ).map(([name, labelKey]) => (
            <div
              key={name}
              className={
                name === "repOrganization" || name === "repStreetName"
                  ? "space-y-2 sm:col-span-2"
                  : "space-y-2"
              }
            >
              <Label htmlFor={name}>{t(labelKey)}</Label>
              <Input
                id={name}
                name={name}
                type={name === "repEmail" ? "email" : "text"}
                defaultValue={representative[name]}
              />
            </div>
          ))}
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
