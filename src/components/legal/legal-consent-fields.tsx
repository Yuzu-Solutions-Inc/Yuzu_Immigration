"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { fieldControlClassName } from "@/lib/field-styles";
import { cn } from "@/lib/utils";

type LegalConsentFieldsProps = {
  privacyChecked: boolean;
  termsChecked: boolean;
  onPrivacyChange: (checked: boolean) => void;
  onTermsChange: (checked: boolean) => void;
  privacyLabel?: ReactNode;
  disabled?: boolean;
};

function ConsentCheckbox({
  id,
  name,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string;
  name: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-2 text-sm leading-relaxed">
      <input
        id={id}
        type="checkbox"
        name={name}
        value="on"
        required
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={cn(
          fieldControlClassName({ control: "checkbox" }),
          "mt-1 shrink-0",
        )}
      />
      <span>{children}</span>
    </label>
  );
}

/** Required terms + privacy checkboxes for account creation and client intake. */
export function LegalConsentFields({
  privacyChecked,
  termsChecked,
  onPrivacyChange,
  onTermsChange,
  privacyLabel,
  disabled,
}: LegalConsentFieldsProps) {
  const t = useTranslations("legal");

  return (
    <div className="space-y-3">
      <ConsentCheckbox
        id="termsAccepted"
        name="termsAccepted"
        checked={termsChecked}
        disabled={disabled}
        onChange={onTermsChange}
      >
        {t("agreeTerms")}{" "}
        <Link
          href="/terms"
          className="text-action underline-offset-2 hover:underline"
        >
          {t("termsName")}
        </Link>
        .
      </ConsentCheckbox>
      <ConsentCheckbox
        id="privacyAccepted"
        name="privacyAccepted"
        checked={privacyChecked}
        disabled={disabled}
        onChange={onPrivacyChange}
      >
        {privacyLabel ?? (
          <>
            {t("agreePrivacy")}{" "}
            <Link
              href="/privacy"
              className="text-action underline-offset-2 hover:underline"
            >
              {t("privacyName")}
            </Link>
            .
          </>
        )}
      </ConsentCheckbox>
    </div>
  );
}
