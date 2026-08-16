"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  changePasswordAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AppLocale } from "@/lib/i18n/locales";

const initial: SettingsActionState = {};

export function ChangePasswordForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState(changePasswordAction, initial);

  const error =
    state.error &&
    ({
      invalid: t("passwordErrors.invalid"),
      password_mismatch: t("passwordErrors.mismatch"),
      wrong_password: t("passwordErrors.wrongPassword"),
      password_update_failed: t("passwordErrors.updateFailed"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <form action={action} className="space-y-4 rounded-lg border border-border bg-canvas/40 p-4">
      <input type="hidden" name="locale" value={locale} />

      <div className="space-y-1">
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("passwordChangeTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("passwordChangeHelp")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="currentPassword">{t("currentPassword")}</Label>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="newPassword">{t("newPassword")}</Label>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-10"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmNewPassword">{t("confirmPassword")}</Label>
        <Input
          id="confirmNewPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-10"
        />
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {state.success ? (
        <p className="text-sm text-success" role="status">
          {t("passwordChanged")}
        </p>
      ) : null}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t("passwordChangeSaving") : t("passwordChangeCta")}
      </Button>
    </form>
  );
}
