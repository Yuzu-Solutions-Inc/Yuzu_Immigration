"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  acceptLegalAction,
  type AcceptLegalState,
} from "@/app/actions/legal";
import { LegalConsentFields } from "@/components/legal/legal-consent-fields";
import { Button } from "@/components/ui/button";
import { FieldError, FormStack } from "@/components/ui/field";

const initialState: AcceptLegalState = {};

export function AcceptLegalForm({
  locale,
  nextPath,
}: {
  locale: string;
  nextPath?: string;
}) {
  const t = useTranslations("legal");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [state, formAction, pending] = useActionState(
    acceptLegalAction,
    initialState,
  );

  const errorMessage =
    state.error === "legal_required"
      ? t("legalRequired")
      : state.error === "save_failed"
        ? t("acceptFailed")
        : null;

  return (
    <FormStack action={formAction} gap="tight">
      <input type="hidden" name="locale" value={locale} />
      {nextPath ? <input type="hidden" name="next" value={nextPath} /> : null}
      <LegalConsentFields
        privacyChecked={privacyAccepted}
        termsChecked={termsAccepted}
        onPrivacyChange={setPrivacyAccepted}
        onTermsChange={setTermsAccepted}
        disabled={pending}
      />
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={pending || !privacyAccepted || !termsAccepted}
      >
        {pending ? t("accepting") : t("acceptCta")}
      </Button>
    </FormStack>
  );
}
