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
import {
  APP_LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/i18n/locales";

const initial: SettingsActionState = {};

export function AccountSettingsForm({
  locale,
  email,
  fullName,
  preferredLocale,
}: {
  locale: AppLocale;
  email: string;
  fullName: string;
  preferredLocale: AppLocale;
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
    <form action={action} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />

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

      <div className="space-y-2">
        <Label htmlFor="preferredLocale">{t("preferredLocale")}</Label>
        <select
          id="preferredLocale"
          name="preferredLocale"
          defaultValue={preferredLocale}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px]"
        >
          {APP_LOCALES.map((code) => (
            <option key={code} value={code}>
              {LOCALE_LABELS[code]}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {t("preferredLocaleHelp")}
        </p>
      </div>

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
