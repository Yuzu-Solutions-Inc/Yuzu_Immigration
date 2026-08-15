"use client";

import { useActionState, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disconnectSquareAction,
  saveSquareCancelPolicyAction,
  startSquareConnectAction,
  type SquareActionState,
} from "@/app/actions/square";
import { SquareLogo } from "@/components/brand/square-logo";
import {
  IntegrationAccountCard,
  IntegrationPanel,
} from "@/components/settings/integration-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { centsToPriceInput } from "@/lib/booking/slots";
import type { CancelRefundFeeType } from "@/lib/square/cancel-policy";

const initialSaveState: SquareActionState = {};

export type SquareSettingsConnection = {
  business_name: string | null;
  merchant_id: string;
  currency: string;
  is_enabled: boolean;
  cancel_refund_enabled: boolean;
  cancel_min_days_before: number;
  cancel_refund_fee_type: string;
  cancel_refund_fee_cents: number;
  cancel_refund_fee_percent: number;
};

export function SquareSettings({
  locale,
  configured,
  connection,
}: {
  locale: string;
  configured: boolean;
  connection: SquareSettingsConnection | null;
}) {
  const t = useTranslations("settings");
  const connected = Boolean(connection?.is_enabled);
  const [pending, startTransition] = useTransition();
  const [refundEnabled, setRefundEnabled] = useState(
    connection?.cancel_refund_enabled !== false,
  );
  const [feeType, setFeeType] = useState<CancelRefundFeeType>(() => {
    const raw = connection?.cancel_refund_fee_type;
    return raw === "fixed" || raw === "percent" ? raw : "none";
  });
  const [saveState, saveAction, savePending] = useActionState(
    async (_prev: SquareActionState, formData: FormData) => {
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
    <IntegrationPanel
      logo={<SquareLogo className="size-9" />}
      title={t("squareTitle")}
      description={t("squareHelp")}
      connected={connected}
      statusConnectedLabel={t("statusConnected")}
      statusDisconnectedLabel={t("statusNotConnected")}
      actions={
        configured ? (
          !connected ? (
            <form action={startSquareConnectAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" size="sm" className="gap-2">
                <SquareLogo className="size-4" />
                {t("squareConnect")}
              </Button>
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const result = await disconnectSquareAction(locale);
                  if (result.error) {
                    toast.error(t(`squareErrors.${result.error}`));
                  } else {
                    toast.success(t("squareDisconnected"));
                  }
                });
              }}
            >
              {t("squareDisconnect")}
            </Button>
          )
        ) : null
      }
    >
      {!configured ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {t("squareNotConfigured")}
        </p>
      ) : null}

      {connected ? (
        <div className="space-y-4">
          <IntegrationAccountCard
            label={t("squareConnectedAs")}
            primary={connection?.business_name ?? connection?.merchant_id ?? ""}
            secondary={t("squareCurrency", {
              currency: connection?.currency ?? "CAD",
            })}
          />

          <form action={saveAction} className="space-y-4 rounded-xl border border-border bg-canvas/60 p-4">
            <input type="hidden" name="locale" value={locale} />
            <input
              type="hidden"
              name="cancelRefundEnabled"
              value={refundEnabled ? "on" : "off"}
            />
            <div>
              <h3 className="text-sm font-semibold text-brand">
                {t("squareCancelPolicyTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("squareCancelPolicyHelp")}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <Label htmlFor="cancelRefundEnabled" className="text-sm">
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
                size="sm"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="cancelMinDaysBefore" className="text-xs">
                {t("squareCancelMinDays")}
              </Label>
              <Input
                id="cancelMinDaysBefore"
                name="cancelMinDaysBefore"
                type="number"
                min={0}
                max={365}
                step={1}
                defaultValue={connection?.cancel_min_days_before ?? 0}
                className="max-w-[8rem]"
              />
              <p className="text-xs text-muted-foreground">
                {t("squareCancelMinDaysHelp")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cancelRefundFeeType" className="text-xs">
                {t("squareCancelRefundFee")}
              </Label>
              <select
                id="cancelRefundFeeType"
                name="cancelRefundFeeType"
                value={feeType}
                onChange={(event) =>
                  setFeeType(event.target.value as CancelRefundFeeType)
                }
                disabled={!refundEnabled}
                className="h-10 w-full max-w-xs rounded-xl border border-input bg-surface px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50"
              >
                <option value="none">{t("squareFeeNone")}</option>
                <option value="fixed">{t("squareFeeFixed")}</option>
                <option value="percent">{t("squareFeePercent")}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {t("squareCancelRefundFeeHelp")}
              </p>

              {feeType === "fixed" ? (
                <div className="space-y-1">
                  <Label htmlFor="cancelRefundFeeDollars" className="text-xs">
                    {t("squareFeeFixedAmount", {
                      currency: connection?.currency ?? "CAD",
                    })}
                  </Label>
                  <Input
                    id="cancelRefundFeeDollars"
                    name="cancelRefundFeeDollars"
                    type="number"
                    min={0}
                    step="0.01"
                    disabled={!refundEnabled}
                    defaultValue={centsToPriceInput(
                      connection?.cancel_refund_fee_cents ?? 0,
                    )}
                    className="max-w-[8rem]"
                  />
                </div>
              ) : null}

              {feeType === "percent" ? (
                <div className="space-y-1">
                  <Label htmlFor="cancelRefundFeePercent" className="text-xs">
                    {t("squareFeePercentAmount")}
                  </Label>
                  <Input
                    id="cancelRefundFeePercent"
                    name="cancelRefundFeePercent"
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={!refundEnabled}
                    defaultValue={connection?.cancel_refund_fee_percent ?? 0}
                    className="max-w-[8rem]"
                  />
                </div>
              ) : null}
            </div>

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
        </div>
      ) : configured ? (
        <p className="text-sm text-muted-foreground">{t("squareNotConnected")}</p>
      ) : null}
    </IntegrationPanel>
  );
}
