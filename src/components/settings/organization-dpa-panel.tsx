"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  acceptOrganizationDpaAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import { FirmDpaConsentFields } from "@/components/legal/legal-consent-fields";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, FieldSuccess } from "@/components/ui/field";
import { legalDownloadHref } from "@/lib/legal/downloads";
import { FIRM_DPA_VERSION } from "@/lib/legal/dpa";
import type { AppLocale } from "@/lib/i18n/locales";

const initial: SettingsActionState = {};

export function OrganizationDpaPanel({
  locale,
  acceptedAt,
  acceptedVersion,
}: {
  locale: AppLocale;
  acceptedAt: string | null;
  acceptedVersion: string | null;
}) {
  const t = useTranslations("settings");
  const tl = useTranslations("legal");
  const current =
    Boolean(acceptedAt) && acceptedVersion === FIRM_DPA_VERSION;
  const [dpaAccepted, setDpaAccepted] = useState(false);
  const [dpaAuthority, setDpaAuthority] = useState(false);
  const [state, action, pending] = useActionState(
    acceptOrganizationDpaAction,
    initial,
  );

  const error =
    state.error &&
    ({
      dpa_required: t("errors.dpaRequired"),
      save_failed: t("errors.saveFailed"),
      forbidden: t("errors.forbidden"),
    }[state.error] ??
      t("errors.generic"));

  const accepted = current || state.success;
  const acceptedLabel = acceptedAt
    ? t("dpaAcceptedMeta", {
        date: new Date(acceptedAt).toLocaleString(locale, {
          dateStyle: "long",
          timeStyle: "short",
        }),
        version: acceptedVersion ?? FIRM_DPA_VERSION,
      })
    : t("dpaAcceptedNow", { version: FIRM_DPA_VERSION });

  return (
    <section className="space-y-4">
      <h3 className="font-heading text-base font-semibold text-brand">
        {t("dpaTitle")}
      </h3>
      <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
        {t("dpaHelp")}
      </p>
      {accepted ? (
        <>
          <FieldSuccess>{acceptedLabel}</FieldSuccess>
          <FieldHint>
            {tl("dpaCountersignHelp")}{" "}
            <a
              href={legalDownloadHref(
                "firm-data-processing-addendum.md",
                locale,
              )}
              download="firm-data-processing-addendum.md"
              className="text-action underline-offset-2 hover:underline"
            >
              {tl("dpaDownload")}
            </a>
          </FieldHint>
        </>
      ) : (
        <form action={action} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <FirmDpaConsentFields
            dpaChecked={dpaAccepted}
            authorityChecked={dpaAuthority}
            onDpaChange={setDpaAccepted}
            onAuthorityChange={setDpaAuthority}
            disabled={pending}
          />
          {error ? <FieldError>{error}</FieldError> : null}
          <Button
            type="submit"
            disabled={pending || !dpaAccepted || !dpaAuthority}
          >
            {pending ? t("dpaAccepting") : t("dpaAcceptCta")}
          </Button>
        </form>
      )}
    </section>
  );
}
