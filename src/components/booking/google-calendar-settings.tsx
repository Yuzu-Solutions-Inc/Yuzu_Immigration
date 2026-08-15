"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disconnectGoogleCalendarAction,
  startGoogleCalendarConnectAction,
  syncGoogleCalendarNowAction,
} from "@/app/actions/google-calendar";
import { GoogleCalendarLogo } from "@/components/brand/google-calendar-logo";
import {
  IntegrationAccountCard,
  IntegrationPanel,
} from "@/components/settings/integration-panel";
import { Button } from "@/components/ui/button";
import type { GoogleCalendarConnectionPublic } from "@/lib/booking/types";

export function GoogleCalendarSettings({
  locale,
  configured,
  connection,
  compact = false,
}: {
  locale: string;
  configured: boolean;
  connection: GoogleCalendarConnectionPublic | null;
  compact?: boolean;
}) {
  const t = useTranslations("calendar");
  const connected = Boolean(connection?.is_enabled);
  const [pending, startTransition] = useTransition();

  return (
    <IntegrationPanel
      compact={compact}
      headingLevel={compact ? 3 : 2}
      logo={
        <GoogleCalendarLogo className={compact ? "size-7" : "size-9"} />
      }
      title={t("googleTitle")}
      description={t("googleHelp")}
      connected={connected}
      statusConnectedLabel={t("statusConnected")}
      statusDisconnectedLabel={t("statusNotConnected")}
      actions={
        configured ? (
          !connected ? (
            <form action={startGoogleCalendarConnectAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" size="sm" className="gap-2">
                <GoogleCalendarLogo className="size-4" />
                {t("googleConnect")}
              </Button>
            </form>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await syncGoogleCalendarNowAction(locale);
                    if (result.error) toast.error(t(`errors.${result.error}`));
                    else toast.success(t("googleSynced"));
                  });
                }}
              >
                {t("googleSyncNow")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await disconnectGoogleCalendarAction(locale);
                    if (result.error) toast.error(t(`errors.${result.error}`));
                    else toast.success(t("googleDisconnected"));
                  });
                }}
              >
                {t("googleDisconnect")}
              </Button>
            </>
          )
        ) : null
      }
    >
      {!configured ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {t("googleNotConfigured")}
        </p>
      ) : null}

      {connected ? (
        <IntegrationAccountCard
          label={t("googleConnectedAs")}
          primary={connection?.google_email ?? t("googleUnknownAccount")}
          secondary={
            connection?.last_synced_at
              ? t("googleLastSynced", {
                  when: new Date(connection.last_synced_at).toLocaleString(
                    locale,
                  ),
                })
              : null
          }
        />
      ) : configured ? (
        <p className="text-sm text-muted-foreground">{t("googleNotConnected")}</p>
      ) : null}
    </IntegrationPanel>
  );
}
