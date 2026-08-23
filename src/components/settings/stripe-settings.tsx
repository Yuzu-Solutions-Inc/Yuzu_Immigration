"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  continueStripeOnboardingAction,
  disconnectStripeAction,
  startStripeConnectAction,
} from "@/app/actions/stripe-connect";
import { StripeLogo } from "@/components/brand/stripe-logo";
import {
  IntegrationAccountCard,
  IntegrationPanel,
} from "@/components/settings/integration-panel";
import { Button } from "@/components/ui/button";

export type StripeSettingsConnection = {
  business_name: string | null;
  stripe_account_id: string;
  currency: string;
  is_enabled: boolean;
  charges_ready: boolean;
  details_submitted: boolean;
};

export function StripeSettings({
  locale,
  configured,
  connection,
  otherProcessorConnected,
}: {
  locale: string;
  configured: boolean;
  connection: StripeSettingsConnection | null;
  otherProcessorConnected: boolean;
}) {
  const t = useTranslations("settings");
  const connected = Boolean(connection?.is_enabled);
  const ready = Boolean(connection?.is_enabled && connection.charges_ready);
  const [pending, startTransition] = useTransition();

  const confirmSwitch = () => {
    if (!otherProcessorConnected) return true;
    return window.confirm(t("processorSwitchConfirm"));
  };

  return (
    <IntegrationPanel
      logo={<StripeLogo className="size-9" />}
      title={t("stripeTitle")}
      description={t("stripeHelp")}
      connected={connected}
      statusConnectedLabel={
        ready ? t("statusConnected") : t("stripeOnboardingIncomplete")
      }
      statusDisconnectedLabel={t("statusNotConnected")}
      actions={
        configured ? (
          !connected ? (
            <form
              action={startStripeConnectAction}
              onSubmit={(event) => {
                if (!confirmSwitch()) event.preventDefault();
              }}
            >
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" size="sm" className="gap-2">
                <StripeLogo className="size-4" />
                {t("stripeConnect")}
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {!ready ? (
                <form action={continueStripeOnboardingAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <Button type="submit" size="sm">
                    {t("stripeContinueOnboarding")}
                  </Button>
                </form>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await disconnectStripeAction(locale);
                    if (result.error) {
                      toast.error(
                        t(`stripeErrors.${result.error}`, {
                          defaultValue: t("stripeErrors.save_failed"),
                        }),
                      );
                    } else {
                      toast.success(t("stripeDisconnected"));
                    }
                  });
                }}
              >
                {t("stripeDisconnect")}
              </Button>
            </div>
          )
        ) : null
      }
    >
      {!configured ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {t("stripeNotConfigured")}
        </p>
      ) : null}

      {connected ? (
        <IntegrationAccountCard
          label={t("stripeConnectedAs")}
          primary={
            connection?.business_name ?? connection?.stripe_account_id ?? ""
          }
          secondary={t("stripeCurrency", {
            currency: connection?.currency ?? "CAD",
          })}
        />
      ) : configured ? (
        <p className="text-sm text-muted-foreground">
          {otherProcessorConnected
            ? t("stripeBlockedBySquare")
            : t("stripeNotConnected")}
        </p>
      ) : null}

      {connection && !connection.is_enabled ? (
        <p className="text-xs text-muted-foreground">{t("processorLinksKeepWorking")}</p>
      ) : null}
    </IntegrationPanel>
  );
}
