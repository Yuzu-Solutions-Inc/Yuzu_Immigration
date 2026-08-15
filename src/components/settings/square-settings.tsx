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

export function SquareSettings({
  locale,
  configured,
  connection,
}: {
  locale: string;
  configured: boolean;
  connection: {
    business_name: string | null;
    merchant_id: string;
    currency: string;
    is_enabled: boolean;
  } | null;
}) {
  const t = useTranslations("settings");
  const connected = Boolean(connection?.is_enabled);
  const [pending, startTransition] = useTransition();

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
        <IntegrationAccountCard
          label={t("squareConnectedAs")}
          primary={connection?.business_name ?? connection?.merchant_id ?? ""}
          secondary={t("squareCurrency", {
            currency: connection?.currency ?? "CAD",
          })}
        />
      ) : configured ? (
        <p className="text-sm text-muted-foreground">{t("squareNotConnected")}</p>
      ) : null}
    </IntegrationPanel>
  );
}
