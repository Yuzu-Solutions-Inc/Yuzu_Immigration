"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updatePersonAction,
  type UpdatePersonState,
} from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PersonImmigrationStatus } from "@/db/schema";
import {
  PERSON_IMMIGRATION_STATUSES,
  personStatusAllowsExpiry,
} from "@/lib/crm/person-status";

const initialState: UpdatePersonState = {};

export function EditPersonForm({
  locale,
  person,
}: {
  locale: "en" | "fr";
  person: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    preferred_locale: string;
    immigration_status: PersonImmigrationStatus;
    status_expires_at: string | null;
  };
}) {
  const t = useTranslations("people");
  const ti = useTranslations("immigrationStatus");
  const [immigrationStatus, setImmigrationStatus] =
    useState<PersonImmigrationStatus>(person.immigration_status);
  const [statusExpiresAt, setStatusExpiresAt] = useState(
    person.status_expires_at ?? "",
  );
  const [state, formAction, pending] = useActionState(
    updatePersonAction,
    initialState,
  );

  const expiryEnabled = personStatusAllowsExpiry(immigrationStatus);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        update_failed: t("errors.updateFailed"),
        not_found: t("errors.notFound"),
      }[state.error] ?? t("errors.generic")
    : null;

  return (
    <form action={formAction} className="space-y-5">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="personId" value={person.id} />
      <input type="hidden" name="immigrationStatus" value={immigrationStatus} />
      <input
        type="hidden"
        name="statusExpiresAt"
        value={expiryEnabled ? statusExpiresAt : ""}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">{t("firstName")}</Label>
          <Input
            id="firstName"
            name="firstName"
            defaultValue={person.first_name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{t("lastName")}</Label>
          <Input
            id="lastName"
            name="lastName"
            defaultValue={person.last_name}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t("emailOptional")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={person.email ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t("phoneOptional")}</Label>
          <Input
            id="phone"
            name="phone"
            type="tel"
            defaultValue={person.phone ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="preferredLocale">{t("preferredLocale")}</Label>
          <select
            id="preferredLocale"
            name="preferredLocale"
            defaultValue={
              person.preferred_locale === "fr" ? "fr" : "en"
            }
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="en">{t("locales.en")}</option>
            <option value="fr">{t("locales.fr")}</option>
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
        {pending ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
