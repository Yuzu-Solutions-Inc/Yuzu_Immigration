"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  IntegrationAccountCard,
  IntegrationPanel,
} from "@/components/settings/integration-panel";
import { Button } from "@/components/ui/button";

type ConnectionPublic = {
  email: string | null;
  last_synced_at: string | null;
  is_enabled: boolean;
};

export function StaffIntegrationCard({
  locale,
  configured,
  connection,
  selected,
  logo,
  title,
  description,
  comingSoon,
  connectedAsLabel,
  unknownAccountLabel,
  lastSyncedKey,
  notConfiguredMessage,
  syncSuccessKey,
  connectAction,
  onUse,
  onStop,
  onSync,
}: {
  locale: string;
  configured: boolean;
  connection: ConnectionPublic | null;
  selected: boolean;
  logo: ReactNode;
  title: string;
  description?: string;
  comingSoon?: boolean;
  connectedAsLabel: string;
  unknownAccountLabel: string;
  lastSyncedKey?: "googleLastSynced" | "microsoftLastSynced";
  notConfiguredMessage: string;
  syncSuccessKey?: "googleSynced" | "microsoftSynced";
  connectAction: ReactNode;
  onUse: () => Promise<{ error?: string; message?: string }>;
  onStop: () => Promise<{ error?: string; message?: string }>;
  onSync?: () => Promise<{ error?: string; message?: string }>;
}) {
  const t = useTranslations("calendar");
  const connected = Boolean(connection?.is_enabled);
  const inUse = connected && selected;
  const [pending, startTransition] = useTransition();

  function run(
    action: () => Promise<{ error?: string; message?: string }>,
    successKey: string,
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.error) toast.error(t(`errors.${result.error}`));
      else toast.success(t(successKey));
    });
  }

  return (
    <IntegrationPanel
      headingLevel={3}
      logo={logo}
      title={title}
      description={description}
      comingSoonLabel={comingSoon ? t("comingSoon") : undefined}
      connected={inUse || connected}
      statusConnectedLabel={inUse ? t("statusInUse") : t("statusConnected")}
      statusDisconnectedLabel={t("statusNotConnected")}
      actions={
        configured ? (
          !connected ? (
            connectAction
          ) : inUse ? (
            <>
              {onSync && syncSuccessKey ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => run(onSync, syncSuccessKey)}
                >
                  {t("googleSyncNow")}
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(onStop, "stoppedUsing")}
              >
                {t("stopUsing")}
              </Button>
            </>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() => run(onUse, "nowUsing")}
            >
              {t("useThis")}
            </Button>
          )
        ) : null
      }
    >
      {!configured ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {notConfiguredMessage}
        </p>
      ) : null}

      {connected ? (
        <IntegrationAccountCard
          label={connectedAsLabel}
          primary={connection?.email ?? unknownAccountLabel}
          secondary={
            connection?.last_synced_at && lastSyncedKey
              ? t(lastSyncedKey, {
                  when: new Date(connection.last_synced_at).toLocaleString(
                    locale,
                  ),
                })
              : null
          }
        />
      ) : null}

      {connected && !inUse ? (
        <p className="text-xs text-muted-foreground">{t("connectedNotInUse")}</p>
      ) : null}
    </IntegrationPanel>
  );
}
