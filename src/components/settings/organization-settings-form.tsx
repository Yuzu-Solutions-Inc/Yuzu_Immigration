"use client";

import { useActionState, useState } from "react";
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
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
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
  privacyContactEmail: string;
  portalGoogleLoginEnabled: boolean;
};

export function OrganizationSettingsForm({
  locale,
  initialValues,
}: {
  locale: AppLocale;
  initialValues: OrgSettingsValues;
}) {
  const t = useTranslations("settings");
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(
    initialValues.portalGoogleLoginEnabled,
  );
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

      <section className="space-y-4">
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("privacyContactTitle")}
        </h3>
        <Field>
          <FieldLabel htmlFor="privacyContactEmail" required>
            {t("privacyContactEmail")}
          </FieldLabel>
          <Input
            id="privacyContactEmail"
            name="privacyContactEmail"
            type="email"
            required
            autoComplete="email"
            defaultValue={initialValues.privacyContactEmail}
            maxLength={254}
          />
          <FieldHint>{t("privacyContactEmailHelp")}</FieldHint>
        </Field>
      </section>

      <section className="space-y-4">
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("portalGoogleTitle")}
        </h3>
        <input
          type="hidden"
          name="portalGoogleLoginEnabled"
          value={googleLoginEnabled ? "on" : "off"}
        />
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="portalGoogleLoginEnabled">
              {t("portalGoogleLogin")}
            </Label>
            <FieldHint>{t("portalGoogleLoginHelp")}</FieldHint>
          </div>
          <Switch
            id="portalGoogleLoginEnabled"
            checked={googleLoginEnabled}
            onCheckedChange={setGoogleLoginEnabled}
          />
        </div>
      </section>

      {error ? <FieldError>{error}</FieldError> : null}
      {state.success ? <FieldSuccess>{t("saved")}</FieldSuccess> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </FormStack>
  );
}
