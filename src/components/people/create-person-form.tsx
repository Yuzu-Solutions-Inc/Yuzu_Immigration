"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createPersonAction,
  type CreatePersonState,
} from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonImmigrationStatus } from "@/db/schema";
import {
  PERSON_IMMIGRATION_STATUSES,
  personStatusAllowsExpiry,
} from "@/lib/crm/person-status";
import type { AppLocale } from "@/lib/i18n/locales";

const initialState: CreatePersonState = {};

export function CreatePersonForm({ locale }: { locale: AppLocale }) {
  const t = useTranslations("people");
  const ti = useTranslations("immigrationStatus");
  const [immigrationStatus, setImmigrationStatus] =
    useState<PersonImmigrationStatus>("none");
  const [statusExpiresAt, setStatusExpiresAt] = useState("");
  const [state, formAction, pending] = useActionState(
    createPersonAction,
    initialState,
  );

  const expiryEnabled = personStatusAllowsExpiry(immigrationStatus);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        create_failed: t("errors.createFailed"),
        forbidden: t("errors.forbidden"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="immigrationStatus" value={immigrationStatus} />
      <input
        type="hidden"
        name="statusExpiresAt"
        value={expiryEnabled ? statusExpiresAt : ""}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("firstName")}</Label>
          <Input id="firstName" name="firstName" required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("lastName")}</Label>
          <Input id="lastName" name="lastName" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("emailOptional")}</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("phoneOptional")}</Label>
          <Input id="phone" name="phone" type="tel" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredLocale">{t("preferredLocale")}</Label>
          <select
            id="preferredLocale"
            name="preferredLocale"
            defaultValue={locale}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="en">{t("locales.en")}</option>
            <option value="fr">{t("locales.fr")}</option>
            <option value="es">{t("locales.es")}</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="immigrationStatus">{t("immigrationStatus")}</Label>
          <select
            id="immigrationStatus"
            value={immigrationStatus}
            onChange={(e) => {
              const next = e.target.value as PersonImmigrationStatus;
              setImmigrationStatus(next);
              if (!personStatusAllowsExpiry(next)) {
                setStatusExpiresAt("");
              }
            }}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            {PERSON_IMMIGRATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ti(value)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="statusExpiresAt">{t("statusExpiresAt")}</Label>
          <Input
            id="statusExpiresAt"
            type="date"
            value={statusExpiresAt}
            disabled={!expiryEnabled}
            onChange={(e) => setStatusExpiresAt(e.target.value)}
            className="disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground">
            {t("statusExpiresAtHelp")}
          </p>
        </div>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
