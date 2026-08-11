"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  updateOrganizationSettingsAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/lib/i18n/locales";

const initial: SettingsActionState = {};

export type OrgSettingsValues = {
  name: string;
  slug: string;
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

export function OrganizationSettingsForm({
  locale,
  initialValues,
}: {
  locale: AppLocale;
  initialValues: OrgSettingsValues;
}) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState(
    updateOrganizationSettingsAction,
    initial,
  );

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      slug_taken: t("errors.slugTaken"),
      save_failed: t("errors.saveFailed"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />

      <section className="space-y-4">
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("orgBasics")}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">{t("orgName")}</Label>
            <Input
              id="name"
              name="name"
              defaultValue={initialValues.name}
              required
              maxLength={120}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="slug">{t("orgSlug")}</Label>
            <Input
              id="slug"
              name="slug"
              defaultValue={initialValues.slug}
              required
              maxLength={48}
            />
            <p className="text-xs text-muted-foreground">{t("orgSlugHelp")}</p>
          </div>
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
                defaultValue={initialValues[name]}
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
        <p className="text-sm text-emerald-700" role="status">
          {t("saved")}
        </p>
      ) : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
