"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  savePartnerFormAction,
  type PartnerFormState,
} from "@/app/actions/finance-partners";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PERSON_IMMIGRATION_STATUSES } from "@/lib/crm/person-status";
import { splitDisplayName } from "@/lib/crm/partner-person-names";
import type { InvoiceLanguage, Partner, PartnerKind } from "@/lib/finance/types";

const initialState: PartnerFormState = {};

export function PartnerForm({
  locale,
  partner,
  person,
  financeOn,
  immigrationOn,
}: {
  locale: string;
  partner?: Partner;
  person?: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  financeOn: boolean;
  immigrationOn: boolean;
}) {
  const t = useTranslations("financeApp");
  const tp = useTranslations("people");
  const ti = useTranslations("immigrationStatus");
  const isEdit = Boolean(partner);
  const split = splitDisplayName(
    partner?.legal_name ?? "",
    partner?.contact_name,
  );
  const [kind, setKind] = useState<PartnerKind>(partner?.kind ?? "customer");
  const [immigrationStatus, setImmigrationStatus] = useState(
    partner?.immigration_status ?? "none",
  );
  const [state, formAction, pending] = useActionState(
    savePartnerFormAction,
    initialState,
  );

  const showPersonNames =
    immigrationOn && (kind === "customer" || kind === "both");
  const showFinance = financeOn && (kind === "customer" || kind === "both");
  const showImmigration =
    immigrationOn && (kind === "customer" || kind === "both");

  const errorMessage = state.error
    ? state.error === "invalid"
      ? tp("errors.invalid")
      : state.error === "trial_expired"
        ? tp("errors.trialExpired")
        : t("partners.saveFailed")
    : null;

  return (
    <FormStack action={formAction}>
      <input type="hidden" name="locale" value={locale} />
      {partner ? <input type="hidden" name="id" value={partner.id} /> : null}

      <Field>
        <FieldLabel htmlFor="partner-kind" required>
          {t("partners.roleStar")}
        </FieldLabel>
        <NativeSelect
          id="partner-kind"
          name="kind"
          required
          value={kind}
          onChange={(e) => setKind(e.target.value as PartnerKind)}
        >
          <option value="customer">{t("partners.kindCustomer")}</option>
          <option value="provider">{t("partners.kindProvider")}</option>
          <option value="both">{t("partners.kindBoth")}</option>
        </NativeSelect>
        <FieldHint>{t("partners.roleHint")}</FieldHint>
      </Field>

      {showPersonNames ? (
        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="partner-first-name" required>
              {tp("firstName")}
            </FieldLabel>
            <Input
              id="partner-first-name"
              name="firstName"
              required
              autoFocus={!isEdit}
              defaultValue={person?.first_name ?? split.firstName}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="partner-last-name" required>
              {tp("lastName")}
            </FieldLabel>
            <Input
              id="partner-last-name"
              name="lastName"
              required
              defaultValue={person?.last_name ?? split.lastName}
            />
          </Field>
        </FieldGrid>
      ) : (
        <Field>
          <FieldLabel htmlFor="partner-legal-name" required>
            {t("partners.legalName")}
          </FieldLabel>
          <Input
            id="partner-legal-name"
            name="legal_name"
            required
            autoFocus={!isEdit}
            defaultValue={partner?.legal_name ?? ""}
          />
        </Field>
      )}

      <FieldGrid>
        {showPersonNames ? null : (
          <Field>
            <FieldLabel htmlFor="partner-contact">{t("partners.contact")}</FieldLabel>
            <Input
              id="partner-contact"
              name="contact_name"
              defaultValue={partner?.contact_name ?? ""}
            />
          </Field>
        )}
        <Field>
          <FieldLabel htmlFor="partner-email">{t("partners.email")}</FieldLabel>
          <Input
            id="partner-email"
            name="email"
            type="email"
            defaultValue={person?.email ?? partner?.email ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="partner-phone">{t("partners.phone")}</FieldLabel>
          <Input
            id="partner-phone"
            name="phone"
            type="tel"
            defaultValue={person?.phone ?? partner?.phone ?? ""}
          />
        </Field>
      </FieldGrid>

      <Field>
        <FieldLabel htmlFor="partner-address">{t("partners.address")}</FieldLabel>
        <Input
          id="partner-address"
          name="address_line1"
          defaultValue={partner?.address_line1 ?? ""}
        />
      </Field>
      <FieldGrid columns={2}>
        <Field>
          <FieldLabel htmlFor="partner-city">{t("partners.city")}</FieldLabel>
          <Input
            id="partner-city"
            name="city"
            defaultValue={partner?.city ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="partner-province">{t("partners.province")}</FieldLabel>
          <Input
            id="partner-province"
            name="province"
            defaultValue={partner?.province ?? "QC"}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="partner-postal">{t("partners.postalCode")}</FieldLabel>
          <Input
            id="partner-postal"
            name="postal_code"
            defaultValue={partner?.postal_code ?? ""}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="partner-country">{t("partners.country")}</FieldLabel>
          <Input
            id="partner-country"
            name="country"
            defaultValue={partner?.country ?? "Canada"}
          />
        </Field>
      </FieldGrid>

      {showImmigration ? (
        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="partner-immigration-status">
              {t("partners.immigrationStatus")}
            </FieldLabel>
            <NativeSelect
              id="partner-immigration-status"
              name="immigration_status"
              value={immigrationStatus}
              onChange={(e) => setImmigrationStatus(e.target.value)}
            >
              {PERSON_IMMIGRATION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {ti(value)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="partner-status-expires">
              {t("partners.statusExpires")}
            </FieldLabel>
            <Input
              id="partner-status-expires"
              name="status_expires_at"
              type="date"
              defaultValue={partner?.status_expires_at ?? ""}
              disabled={immigrationStatus === "none"}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="partner-preferred-locale">
              {tp("preferredLocale")}
            </FieldLabel>
            <NativeSelect
              id="partner-preferred-locale"
              name="preferred_locale"
              defaultValue={partner?.preferred_locale ?? locale}
            >
              <option value="en">{tp("locales.en")}</option>
              <option value="fr">{tp("locales.fr")}</option>
              <option value="es">{tp("locales.es")}</option>
            </NativeSelect>
          </Field>
        </FieldGrid>
      ) : null}

      {showFinance ? (
        <>
          <Field>
            <FieldLabel htmlFor="partner-invoice-language">
              {t("partners.invoiceLanguage")}
            </FieldLabel>
            <NativeSelect
              id="partner-invoice-language"
              name="language"
              defaultValue={(partner?.language ?? "fr") as InvoiceLanguage}
            >
              <option value="fr">{t("partners.langFr")}</option>
              <option value="en">{t("partners.langEn")}</option>
            </NativeSelect>
            <FieldHint>{t("partners.languageHint")}</FieldHint>
          </Field>
          <Field>
            <FieldLabel htmlFor="partner-net-days">{t("partners.netDays")}</FieldLabel>
            <Input
              id="partner-net-days"
              name="payment_terms_days"
              type="number"
              min={0}
              defaultValue={partner?.payment_terms_days ?? 30}
            />
            <FieldHint>{t("partners.netHint")}</FieldHint>
          </Field>
          <Field>
            <FieldLabel htmlFor="partner-penalty">{t("partners.penaltyPct")}</FieldLabel>
            <Input
              id="partner-penalty"
              name="invoice_penalty_percent"
              type="number"
              min={0}
              step={0.01}
              defaultValue={Number(
                ((partner?.invoice_penalty_monthly_pct ?? 0.02) * 100).toFixed(4),
              )}
            />
            <FieldHint>{t("partners.penaltyHint")}</FieldHint>
          </Field>
        </>
      ) : null}

      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? t("common.saving") : t("common.save")}
      </Button>
    </FormStack>
  );
}
