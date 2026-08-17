"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  setNewPassword,
  type AuthActionState,
} from "@/app/actions/auth";
import { BrandLogo } from "@/components/brand/brand-logo";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: AuthActionState = {};

export function ResetPasswordForm({ locale }: { locale: string }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    setNewPassword,
    initialState,
  );

  const errorMessage = state.error
    ? {
        invalid_credentials: t("errors.invalid"),
        password_mismatch: t("errors.passwordMismatch"),
        password_update_failed: t("errors.passwordUpdateFailed"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <>
      <div className="space-y-3 text-center sm:text-left">
        <BrandLogo size="sm" />
        <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
          {t("resetTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("resetSubtitle")}</p>
      </div>

      <SurfaceCard>
        <FormStack action={formAction} gap="tight">
          <input type="hidden" name="locale" value={locale} />
          <Field>
            <FieldLabel htmlFor="password" required>
              {t("newPassword")}
            </FieldLabel>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="confirmPassword" required>
              {t("confirmPassword")}
            </FieldLabel>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
          {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? t("pleaseWait") : t("savePassword")}
          </Button>
        </FormStack>
      </SurfaceCard>
    </>
  );
}
