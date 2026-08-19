"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import {
  preparePayCheckoutAction,
  submitPayAddressAction,
  type PublicPayState,
} from "@/app/actions/public-pay";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CA_PROVINCES, PAY_COUNTRIES } from "@/lib/sage/tax-regions";
import { cn } from "@/lib/utils";

const initialState: PublicPayState = {};

export function PublicPayCheckout({
  locale,
  token,
  needsAddress,
  checkoutUrl,
}: {
  locale: string;
  token: string;
  needsAddress: boolean;
  checkoutUrl: string | null;
}) {
  const t = useTranslations("publicPay");
  const [country, setCountry] = useState("CA");
  const [state, action, pending] = useActionState(
    submitPayAddressAction,
    initialState,
  );
  const [prepError, setPrepError] = useState<string | null>(null);
  const [preparing, startPrepare] = useTransition();
  const [readyUrl, setReadyUrl] = useState(checkoutUrl);

  useEffect(() => {
    if (needsAddress || readyUrl) return;
    startPrepare(async () => {
      const result = await preparePayCheckoutAction(token, locale);
      if (result.checkoutUrl) setReadyUrl(result.checkoutUrl);
      else setPrepError(result.error ?? "create_failed");
    });
  }, [locale, needsAddress, readyUrl, token]);

  const payUrl = state.checkoutUrl || readyUrl;
  const errorKey = state.error || prepError;

  if (payUrl) {
    return (
      <div className="flex justify-center">
        <a
          href={payUrl}
          className={cn(
            buttonVariants(),
            "bg-action text-action-foreground hover:bg-action/90",
          )}
        >
          {t("payWithSquare")}
        </a>
      </div>
    );
  }

  if (needsAddress) {
    return (
      <FormStack action={action} className="text-left">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="locale" value={locale} />
        <p className="text-sm text-muted-foreground">{t("addressHelp")}</p>
        <Field>
          <FieldLabel htmlFor="line1" required>
            {t("addressLine1")}
          </FieldLabel>
          <Input id="line1" name="line1" required autoComplete="address-line1" />
        </Field>
        <Field>
          <FieldLabel htmlFor="line2">{t("addressLine2")}</FieldLabel>
          <Input id="line2" name="line2" autoComplete="address-line2" />
        </Field>
        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="city" required>
              {t("city")}
            </FieldLabel>
            <Input id="city" name="city" required autoComplete="address-level2" />
          </Field>
          <Field>
            <FieldLabel htmlFor="postalCode" required>
              {t("postalCode")}
            </FieldLabel>
            <Input
              id="postalCode"
              name="postalCode"
              required
              autoComplete="postal-code"
            />
          </Field>
        </FieldGrid>
        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="country" required>
              {t("country")}
            </FieldLabel>
            <NativeSelect
              id="country"
              name="country"
              value={country}
              onChange={(event) => setCountry(event.target.value)}
              required
            >
              {PAY_COUNTRIES.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          {country === "CA" ? (
            <Field>
              <FieldLabel htmlFor="region" required>
                {t("province")}
              </FieldLabel>
              <NativeSelect id="region" name="region" required defaultValue="">
                <option value="">{t("provincePlaceholder")}</option>
                {CA_PROVINCES.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.name}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          ) : (
            <Field>
              <FieldLabel htmlFor="region">{t("region")}</FieldLabel>
              <Input id="region" name="region" autoComplete="address-level1" />
            </Field>
          )}
        </FieldGrid>
        {errorKey ? (
          <FieldError>
            {t(`errors.${errorKey}`, { defaultValue: t("errors.create_failed") })}
          </FieldError>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? t("preparing") : t("continueToPay")}
        </Button>
      </FormStack>
    );
  }

  return (
    <div className="space-y-3 text-center">
      {errorKey ? (
        <p className="text-sm text-destructive">
          {t(`errors.${errorKey}`, { defaultValue: t("errors.create_failed") })}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {preparing ? t("preparing") : t("preparing")}
        </p>
      )}
    </div>
  );
}
