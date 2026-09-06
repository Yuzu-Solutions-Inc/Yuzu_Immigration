"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createOrganizationAction,
  type CreateOrgState,
} from "@/app/actions/org";
import { FirmDpaConsentFields } from "@/components/legal/legal-consent-fields";
import { slugifyOrganizationName } from "@/lib/org/slug";
import type { AppLocale } from "@/lib/i18n/locales";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ModulePicker } from "@/components/settings/module-picker";
import {
  ONBOARDING_DEFAULT_MODULES,
  normalizeModuleSelection,
  type ModuleId,
} from "@/lib/modules/catalog";

const initialState: CreateOrgState = {};

export function CreateOrganizationForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("onboarding");
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [state, formAction, pending] = useActionState(
    createOrganizationAction,
    initialState,
  );
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [dpaAuthority, setDpaAuthority] = useState(false);
  const [modules, setModules] = useState<Set<ModuleId>>(
    () => new Set(ONBOARDING_DEFAULT_MODULES),
  );
  const tm = useTranslations("modules");

  const computedSlug = useMemo(() => slugifyOrganizationName(name), [name]);
  const effectiveSlug = slugTouched ? slug : computedSlug;

  const errorMessage = state.error
    ? {
        invalid_org: t("errors.invalid"),
        slug_taken: t("errors.slugTaken"),
        create_failed: t("errors.createFailed"),
        dpa_required: t("errors.dpaRequired"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <FormStack action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={effectiveSlug} />

      <Field>
        <FieldLabel htmlFor="name" required>
          {t("orgName")}
        </FieldLabel>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          placeholder={t("orgNamePlaceholder")}
        />
      </Field>

      <Field>
        <FieldLabel htmlFor="slug">{t("orgSlug")}</FieldLabel>
        <Input
          id="slug"
          value={effectiveSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(slugifyOrganizationName(event.target.value));
          }}
          className="font-mono text-sm"
          placeholder="my-firm"
        />
        <FieldHint>{t("orgSlugHelp")}</FieldHint>
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
          placeholder={t("privacyContactEmailPlaceholder")}
        />
        <FieldHint>{t("privacyContactEmailHelp")}</FieldHint>
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-brand">{tm("title")}</legend>
        <FieldHint>{tm("onboardingHelp")}</FieldHint>
        <input type="hidden" name="modulesPresent" value="1" />
        <ModulePicker
          enabled={modules}
          onChange={(next) => setModules(new Set(normalizeModuleSelection([...next])))}
        />
        {[...modules].map((id) => (
          <input key={id} type="hidden" name="module" value={id} />
        ))}
      </fieldset>

      <div className="space-y-2">
        <FirmDpaConsentFields
          dpaChecked={dpaAccepted}
          authorityChecked={dpaAuthority}
          onDpaChange={setDpaAccepted}
          onAuthorityChange={setDpaAuthority}
          disabled={pending}
        />
        <FieldHint>{t("dpaHelp")}</FieldHint>
      </div>

      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={
          pending || !effectiveSlug || !dpaAccepted || !dpaAuthority
        }
      >
        {pending ? t("creating") : t("create")}
      </Button>
    </FormStack>
  );
}
