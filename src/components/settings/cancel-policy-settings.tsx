"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  saveSquareCancelPolicyAction,
  type SquareActionState,
} from "@/app/actions/square";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { centsToPriceInput } from "@/lib/booking/slots";
import { DEFAULT_SQUARE_CANCEL_REFUND_POLICY } from "@/lib/square/cancel-policy";

const initialSaveState: SquareActionState = {};
const defaultPolicy = DEFAULT_SQUARE_CANCEL_REFUND_POLICY;

export type CancelPolicySettingsValues = {
  cancel_refund_enabled: boolean;
  cancel_free_days_before: number;
  cancel_min_days_before: number;
  cancel_refund_fee_type: string;
  cancel_refund_fee_cents: number;
  cancel_refund_fee_percent: number;
};

export function CancelPolicySettings({
  locale,
  values,
}: {
  locale: string;
  values: CancelPolicySettingsValues | null;
}) {
  const t = useTranslations("settings");
  const [refundEnabled, setRefundEnabled] = useState(
    values?.cancel_refund_enabled !== false,
  );
  const [feeEnabled, setFeeEnabled] = useState(() => {
    const feeType = values?.cancel_refund_fee_type ?? defaultPolicy.cancelRefundFeeType;
    if (feeType === "percent") {
      return (
        (values?.cancel_refund_fee_percent ?? defaultPolicy.cancelRefundFeePercent) >
        0
      );
    }
    if (feeType === "fixed") {
      return (
        (values?.cancel_refund_fee_cents ?? defaultPolicy.cancelRefundFeeCents) > 0
      );
    }
    return (
      (values?.cancel_min_days_before ?? defaultPolicy.cancelFeeDaysBefore) > 0
    );
  });
  const [freeDays, setFreeDays] = useState(
    String(values?.cancel_free_days_before ?? defaultPolicy.cancelFreeDaysBefore),
  );
  const [feeDays, setFeeDays] = useState(
    String(values?.cancel_min_days_before ?? defaultPolicy.cancelFeeDaysBefore),
  );
  const [feeUnit, setFeeUnit] = useState<"fixed" | "percent">(() =>
    (values?.cancel_refund_fee_type ?? defaultPolicy.cancelRefundFeeType) ===
    "percent"
      ? "percent"
      : "fixed",
  );
  const [feeAmount, setFeeAmount] = useState(() => {
    const feeType = values?.cancel_refund_fee_type ?? defaultPolicy.cancelRefundFeeType;
    if (feeType === "percent") {
      return String(
        values?.cancel_refund_fee_percent ?? defaultPolicy.cancelRefundFeePercent,
      );
    }
    return centsToPriceInput(
      values?.cancel_refund_fee_cents ?? defaultPolicy.cancelRefundFeeCents,
    );
  });
  const [saveState, saveAction, savePending] = useActionState(
    async (_prev: SquareActionState, formData: FormData) => {
      if (refundEnabled && feeEnabled) {
        const free = Math.trunc(Number.parseFloat(freeDays) || 0);
        const fee = Math.trunc(Number.parseFloat(feeDays) || 0);
        if (free <= fee) {
          toast.error(t("squareErrors.invalid_policy"));
          return { error: "invalid_policy" };
        }
      }
      const result = await saveSquareCancelPolicyAction(formData);
      if (result.error) {
        toast.error(
          t(`squareErrors.${result.error}`, {
            defaultValue: t("squareErrors.save_failed"),
          }),
        );
      } else {
        toast.success(t("squarePolicySaved"));
      }
      return result;
    },
    initialSaveState,
  );

  return (
    <form
      action={saveAction}
      className="space-y-4 rounded-xl border border-border bg-canvas/60 p-4"
    >
      <input type="hidden" name="locale" value={locale} />
      <input
        type="hidden"
        name="cancelRefundEnabled"
        value={refundEnabled ? "on" : "off"}
      />
      <input
        type="hidden"
        name="cancelRefundFeeEnabled"
        value={feeEnabled ? "on" : "off"}
      />
      <div>
        <h3 className="text-sm font-semibold text-brand">
          {t("squareCancelPolicyTitle")}
        </h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("squareCancelPolicyHelp")}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="min-w-0 space-y-0.5">
          <Label htmlFor="cancelRefundEnabled" className="text-sm font-medium">
            {t("squareCancelRefundEnabled")}
          </Label>
          <p className="text-xs text-muted-foreground">
            {t("squareCancelRefundEnabledHelp")}
          </p>
        </div>
        <Switch
          id="cancelRefundEnabled"
          checked={refundEnabled}
          onCheckedChange={setRefundEnabled}
        />
      </div>

      {refundEnabled ? (
        <div className="space-y-4 border-t border-border pt-4">
          <Field>
            <FieldLabel htmlFor="cancelFreeDaysBefore">
              {t("squareCancelFreeDays")}
            </FieldLabel>
            <Input
              id="cancelFreeDaysBefore"
              name="cancelFreeDaysBefore"
              type="number"
              min={0}
              max={365}
              step={1}
              value={freeDays}
              onChange={(event) => setFreeDays(event.target.value)}
              className="max-w-[8rem]"
            />
            <FieldHint>{t("squareCancelFreeDaysHelp")}</FieldHint>
          </Field>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label
                htmlFor="cancelRefundFeeEnabled"
                className="text-sm font-medium"
              >
                {t("squareCancelRefundFeeEnabled")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("squareCancelRefundFeeEnabledHelp")}
              </p>
            </div>
            <Switch
              id="cancelRefundFeeEnabled"
              checked={feeEnabled}
              onCheckedChange={setFeeEnabled}
            />
          </div>

          {feeEnabled ? (
            <div className="space-y-4 rounded-lg border border-border bg-canvas/40 p-4">
              <Field>
                <FieldLabel htmlFor="cancelRefundFeeAmount">
                  {t("squareCancelRefundFee")}
                </FieldLabel>
                <div className="flex max-w-[14rem] items-stretch">
                  <Input
                    id="cancelRefundFeeAmount"
                    name="cancelRefundFeeAmount"
                    type="number"
                    min={0}
                    max={feeUnit === "percent" ? 100 : undefined}
                    step={feeUnit === "percent" ? 1 : "0.01"}
                    value={feeAmount}
                    onChange={(event) => setFeeAmount(event.target.value)}
                    className="rounded-r-none"
                  />
                  <NativeSelect
                    name="cancelRefundFeeType"
                    value={feeUnit}
                    onChange={(event) =>
                      setFeeUnit(event.target.value as "fixed" | "percent")
                    }
                    aria-label={t("squareCancelRefundFee")}
                    className="w-auto shrink-0 rounded-l-none rounded-r-xl border-l-0 px-2"
                  >
                    <option value="fixed">$</option>
                    <option value="percent">%</option>
                  </NativeSelect>
                </div>
                <FieldHint>{t("squareCancelRefundFeeHelp")}</FieldHint>
              </Field>

              <Field>
                <FieldLabel htmlFor="cancelFeeDaysBefore">
                  {t("squareCancelFeeDays")}
                </FieldLabel>
                <Input
                  id="cancelFeeDaysBefore"
                  name="cancelFeeDaysBefore"
                  type="number"
                  min={0}
                  max={
                    Math.trunc(Number.parseFloat(freeDays) || 0) > 0
                      ? Math.trunc(Number.parseFloat(freeDays) || 0) - 1
                      : 365
                  }
                  step={1}
                  value={feeDays}
                  onChange={(event) => setFeeDays(event.target.value)}
                  className="max-w-[8rem]"
                />
                <FieldHint>{t("squareCancelFeeDaysHelp")}</FieldHint>
              </Field>
            </div>
          ) : null}
        </div>
      ) : null}

      {saveState.error ? (
        <p className="text-sm text-destructive">
          {t(`squareErrors.${saveState.error}`, {
            defaultValue: t("squareErrors.save_failed"),
          })}
        </p>
      ) : null}

      <Button type="submit" size="sm" disabled={savePending}>
        {savePending ? t("squarePolicySaving") : t("squarePolicySave")}
      </Button>
    </form>
  );
}
