"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disconnectSquareAction,
  startSquareConnectAction,
} from "@/app/actions/square";
import { SquareLogo } from "@/components/brand/square-logo";
import {
  IntegrationAccountCard,
  IntegrationPanel,
} from "@/components/settings/integration-panel";
import { Button } from "@/components/ui/button";

export type SquareSettingsConnection = {
  business_name: string | null;
  merchant_id: string;
  currency: string;
  is_enabled: boolean;
  cancel_refund_enabled: boolean;
  cancel_free_days_before: number;
  cancel_min_days_before: number;
  cancel_refund_fee_type: string;
  cancel_refund_fee_cents: number;
  cancel_refund_fee_percent: number;
};

export function SquareSettings({
  locale,
  configured,
  connection,
  otherProcessorConnected,
}: {
  locale: string;
  configured: boolean;
  connection: SquareSettingsConnection | null;
  otherProcessorConnected: boolean;
}) {
  const t = useTranslations("settings");
  const connected = Boolean(connection?.is_enabled);
  const [pending, startTransition] = useTransition();

  const confirmSwitch = () => {
    if (!otherProcessorConnected) return true;
    return window.confirm(t("processorSwitchConfirm"));
  };

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
            <form
              action={startSquareConnectAction}
              onSubmit={(event) => {
                if (!confirmSwitch()) event.preventDefault();
              }}
            >
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
        <IntegrationAccountCard
          label={t("squareConnectedAs")}
          primary={connection?.business_name ?? connection?.merchant_id ?? ""}
          secondary={t("squareCurrency", {
            currency: connection?.currency ?? "CAD",
          })}
        />
      ) : configured ? (
        <p className="text-sm text-muted-foreground">
          {otherProcessorConnected
            ? t("squareBlockedByStripe")
            : t("squareNotConnected")}
        </p>
      ) : null}

      {connection && !connection.is_enabled ? (
        <p className="text-xs text-muted-foreground">
          {t("processorLinksKeepWorking")}
        </p>
      ) : null}
    </IntegrationPanel>
  );
}
