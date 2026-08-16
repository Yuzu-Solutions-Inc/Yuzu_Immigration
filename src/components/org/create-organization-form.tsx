"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createOrganizationAction,
  type CreateOrgState,
} from "@/app/actions/org";
import { slugifyOrganizationName } from "@/lib/org/slug";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const initialState: CreateOrgState = {};

export function CreateOrganizationForm({ locale }: { locale: "en" | "fr" }) {
  const t = useTranslations("onboarding");
  const [name, setName] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [state, formAction, pending] = useActionState(
    createOrganizationAction,
    initialState,
  );

  const computedSlug = useMemo(() => slugifyOrganizationName(name), [name]);
  const effectiveSlug = slugTouched ? slug : computedSlug;

  const errorMessage = state.error
    ? {
        invalid_org: t("errors.invalid"),
        slug_taken: t("errors.slugTaken"),
        create_failed: t("errors.createFailed"),
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

      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending || !effectiveSlug}>
        {pending ? t("creating") : t("create")}
      </Button>
    </FormStack>
  );
}
