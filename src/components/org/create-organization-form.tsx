"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createOrganizationAction,
  type CreateOrgState,
} from "@/app/actions/org";
import { slugifyOrganizationName } from "@/lib/org/slug";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="slug" value={effectiveSlug} />

      <div className="space-y-2">
        <Label htmlFor="name">{t("orgName")}</Label>
        <Input
          id="name"
          name="name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
          minLength={2}
          className="h-10"
          placeholder={t("orgNamePlaceholder")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="slug">{t("orgSlug")}</Label>
        <Input
          id="slug"
          value={effectiveSlug}
          onChange={(event) => {
            setSlugTouched(true);
            setSlug(slugifyOrganizationName(event.target.value));
          }}
          className="h-10 font-mono text-sm"
          placeholder="my-firm"
        />
        <p className="text-xs text-muted-foreground">{t("orgSlugHelp")}</p>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending || !effectiveSlug}>
        {pending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
