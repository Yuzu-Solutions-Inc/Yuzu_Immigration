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
      trial_expired: t("errors.trialExpired"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <FormStack action={action}>
      <input type="hidden" name="locale" value={locale} />

      <FieldGrid>
        <Field>
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
        <Field>
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
        <Field>
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
        </Field>
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
      </FieldGrid>

      <input
        type="hidden"
        name="portalGoogleLoginEnabled"
        value={googleLoginEnabled ? "on" : "off"}
      />
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-canvas px-4 py-3">
        <div className="min-w-0 space-y-0.5">
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

      {error ? <FieldError>{error}</FieldError> : null}
      {state.success ? <FieldSuccess>{t("saved")}</FieldSuccess> : null}

      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </FormStack>
  );
}
