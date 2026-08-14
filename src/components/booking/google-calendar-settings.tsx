"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disconnectGoogleCalendarAction,
  startGoogleCalendarConnectAction,
  syncGoogleCalendarNowAction,
} from "@/app/actions/google-calendar";
import { Button } from "@/components/ui/button";
import type { GoogleCalendarConnectionPublic } from "@/lib/booking/types";

export function GoogleCalendarSettings({
  locale,
  configured,
  connection,
}: {
  locale: string;
  configured: boolean;
  connection: GoogleCalendarConnectionPublic | null;
}) {
  const t = useTranslations("calendar");
  const connected = Boolean(connection?.is_enabled);
  const [pending, startTransition] = useTransition();

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("googleTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("googleHelp")}</p>
      </div>

      {!configured ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {t("googleNotConfigured")}
        </p>
      ) : null}

      {connected ? (
        <div className="space-y-2 rounded-xl border border-border bg-canvas px-3 py-3 text-sm">
          <p className="font-medium text-brand">{t("googleConnectedAs")}</p>
          <p className="text-muted-foreground">
            {connection?.google_email ?? t("googleUnknownAccount")}
          </p>
          {connection?.last_synced_at ? (
            <p className="text-xs text-muted-foreground">
              {t("googleLastSynced", {
                when: new Date(connection.last_synced_at).toLocaleString(locale),
              })}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("googleNotConnected")}</p>
      )}

      {configured ? (
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <form action={startGoogleCalendarConnectAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" size="sm">
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
          )}
        </div>
      ) : null}
    </section>
  );
}
