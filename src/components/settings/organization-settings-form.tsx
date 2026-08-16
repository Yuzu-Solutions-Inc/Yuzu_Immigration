"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  updateOrganizationSettingsAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldHint,
  FieldLabel,
  FieldSuccess,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  APP_LOCALES,
  LOCALE_LABELS,
  type AppLocale,
} from "@/lib/i18n/locales";

const initial: SettingsActionState = {};

export type OrgSettingsValues = {
  name: string;
  slug: string;
  defaultLocale: AppLocale;
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
      forbidden: t("errors.forbidden"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <FormStack action={action} gap="loose">
      <input type="hidden" name="locale" value={locale} />

      <section className="space-y-4">
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("orgBasics")}
        </h3>
        <FieldGrid>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="name" required>
              {t("orgName")}
            </FieldLabel>
            <Input
              id="name"
              name="name"
              defaultValue={initialValues.name}
              required
              maxLength={120}
            />
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="slug" required>
              {t("orgSlug")}
            </FieldLabel>
            <Input
              id="slug"
              name="slug"
              defaultValue={initialValues.slug}
              required
              maxLength={48}
            />
            <FieldHint>{t("orgSlugHelp")}</FieldHint>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="defaultLocale">{t("orgDefaultLocale")}</FieldLabel>
            <NativeSelect
              id="defaultLocale"
              name="defaultLocale"
              defaultValue={initialValues.defaultLocale}
            >
              {APP_LOCALES.map((code) => (
                <option key={code} value={code}>
                  {LOCALE_LABELS[code]}
                </option>
              ))}
            </NativeSelect>
            <FieldHint>{t("orgDefaultLocaleHelp")}</FieldHint>
          </Field>
        </FieldGrid>
      </section>

      {error ? <FieldError>{error}</FieldError> : null}
      {state.success ? <FieldSuccess>{t("saved")}</FieldSuccess> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </FormStack>
  );
}
