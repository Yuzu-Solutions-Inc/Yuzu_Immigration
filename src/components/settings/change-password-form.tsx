"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  changePasswordAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldSuccess,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
    <FormStack
      action={action}
      gap="tight"
      className="rounded-lg border border-border bg-canvas/40 p-4"
    >
      <input type="hidden" name="locale" value={locale} />

      <div className="space-y-1">
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("passwordChangeTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("passwordChangeHelp")}</p>
      </div>

      <Field>
        <FieldLabel htmlFor="currentPassword" required>
          {t("currentPassword")}
        </FieldLabel>
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="newPassword" required>
          {t("newPassword")}
        </FieldLabel>
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="confirmNewPassword" required>
          {t("confirmPassword")}
        </FieldLabel>
        <Input
          id="confirmNewPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </Field>

      {error ? <FieldError>{error}</FieldError> : null}
      {state.success ? (
        <FieldSuccess>{t("passwordChanged")}</FieldSuccess>
      ) : null}

      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? t("passwordChangeSaving") : t("passwordChangeCta")}
      </Button>
    </FormStack>
  );
}
