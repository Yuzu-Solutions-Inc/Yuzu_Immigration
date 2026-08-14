"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disconnectSquareAction,
  startSquareConnectAction,
} from "@/app/actions/square";
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
    <section className="space-y-4 border-t border-border pt-6">
      <div>
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("squareTitle")}
        </h3>
        <p className="text-sm text-muted-foreground">{t("squareHelp")}</p>
      </div>

      {!configured ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {t("squareNotConfigured")}
        </p>
      ) : null}

      {connected ? (
        <div className="space-y-2 rounded-xl border border-border bg-canvas px-3 py-3 text-sm">
          <p className="font-medium text-brand">{t("squareConnectedAs")}</p>
          <p className="text-muted-foreground">
            {connection?.business_name ?? connection?.merchant_id}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("squareCurrency", { currency: connection?.currency ?? "CAD" })}
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("squareNotConnected")}</p>
      )}

      {configured ? (
        <div className="flex flex-wrap gap-2">
          {!connected ? (
            <form action={startSquareConnectAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" size="sm">
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
          )}
        </div>
      ) : null}
    </section>
  );
}
