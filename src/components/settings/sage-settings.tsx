"use client";

import { useActionState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  disconnectSageAction,
  saveSageSettingsAction,
  startSageConnectAction,
  syncSageClientsAction,
  type SageActionState,
} from "@/app/actions/sage";
import { SageLogo } from "@/components/brand/sage-logo";
import {
  IntegrationAccountCard,
  IntegrationPanel,
} from "@/components/settings/integration-panel";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { NativeSelect } from "@/components/ui/native-select";
import { CA_PROVINCES } from "@/lib/sage/tax-regions";

const initialSaveState: SageActionState = {};

export type SageSettingsConnection = {
  business_name: string | null;
  business_id: string;
  currency: string;
  is_enabled: boolean;
  default_ledger_account_id: string | null;
};

export type SageSettingsOption = {
  id: string;
  label: string;
  percent?: number;
};

export type SageSettingsMapping = {
  country_code: string;
  region_code: string | null;
  sage_tax_rate_id: string;
};

export function SageSettings({
  locale,
  configured,
  connection,
  ledgers,
  taxRates,
  mappings,
}: {
  locale: string;
  configured: boolean;
  connection: SageSettingsConnection | null;
  ledgers: SageSettingsOption[];
  taxRates: SageSettingsOption[];
  mappings: SageSettingsMapping[];
}) {
  const t = useTranslations("settings");
  const connected = Boolean(connection?.is_enabled);
  const [pending, startTransition] = useTransition();
  const [saveState, saveAction, savePending] = useActionState(
    async (_prev: SageActionState, formData: FormData) => {
      const result = await saveSageSettingsAction(_prev, formData);
      if (result.error) {
        toast.error(
          t(`sageErrors.${result.error}`, {
            defaultValue: t("sageErrors.save_failed"),
          }),
        );
      } else {
        toast.success(t("sageSaved"));
      }
      return result;
    },
    initialSaveState,
  );

  const mappingByRegion = new Map(
    mappings
      .filter((row) => row.country_code === "CA")
      .map((row) => [row.region_code || "", row.sage_tax_rate_id]),
  );

  return (
    <IntegrationPanel
      logo={<SageLogo className="size-9" />}
      title={t("sageTitle")}
      description={t("sageHelp")}
      connected={connected}
      statusConnectedLabel={t("statusConnected")}
      statusDisconnectedLabel={t("statusNotConnected")}
      actions={
        configured ? (
          !connected ? (
            <form action={startSageConnectAction}>
              <input type="hidden" name="locale" value={locale} />
              <Button type="submit" size="sm" className="gap-2">
                <SageLogo className="size-4" />
                {t("sageConnect")}
              </Button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await syncSageClientsAction(locale);
                    if (result.error) {
                      toast.error(t(`sageErrors.${result.error}`));
                    } else {
                      toast.success(
                        t("sageSynced", { count: result.linked ?? 0 }),
                      );
                    }
                  });
                }}
              >
                {t("sageSyncClients")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await disconnectSageAction(locale);
                    if (result.error) {
                      toast.error(t(`sageErrors.${result.error}`));
                    } else {
                      toast.success(t("sageDisconnected"));
                    }
                  });
                }}
              >
                {t("sageDisconnect")}
              </Button>
            </div>
          )
        ) : null
      }
    >
      {!configured ? (
        <p className="rounded-lg bg-warning-bg px-3 py-2 text-xs text-warning-text">
          {t("sageNotConfigured")}
        </p>
      ) : null}

      {connected ? (
        <div className="space-y-4">
          <IntegrationAccountCard
            label={t("sageConnectedAs")}
            primary={connection?.business_name ?? connection?.business_id ?? ""}
            secondary={t("sageCurrency", {
              currency: connection?.currency ?? "CAD",
            })}
          />

          <form
            action={saveAction}
            className="space-y-4 rounded-xl border border-border bg-canvas/60 p-4"
          >
            <input type="hidden" name="locale" value={locale} />
            <div>
              <h3 className="text-sm font-semibold text-brand">
                {t("sageTaxTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("sageTaxHelp")}
              </p>
            </div>

            <Field>
              <FieldLabel htmlFor="ledgerAccountId" required>
                {t("sageLedger")}
              </FieldLabel>
              <NativeSelect
                id="ledgerAccountId"
                name="ledgerAccountId"
                defaultValue={connection?.default_ledger_account_id ?? ""}
                required
              >
                <option value="">{t("sageLedgerPlaceholder")}</option>
                {ledgers.map((ledger) => (
                  <option key={ledger.id} value={ledger.id}>
                    {ledger.label}
                  </option>
                ))}
              </NativeSelect>
              <FieldHint>{t("sageLedgerHelp")}</FieldHint>
            </Field>

            <div className="space-y-3">
              {CA_PROVINCES.map((province) => {
                const key = `CA:${province.code}`;
                return (
                  <Field key={key}>
                    <input type="hidden" name="mappingKey" value={key} />
                    <FieldLabel htmlFor={`taxRate:${key}`}>
                      {province.name} ({province.label} {province.percent}%)
                    </FieldLabel>
                    <NativeSelect
                      id={`taxRate:${key}`}
                      name={`taxRate:${key}`}
                      defaultValue={mappingByRegion.get(province.code) ?? ""}
                      required
                    >
                      <option value="">{t("sageTaxPlaceholder")}</option>
                      {taxRates.map((rate) => (
                        <option key={rate.id} value={rate.id}>
                          {rate.label}
                          {rate.percent != null ? ` (${rate.percent}%)` : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  </Field>
                );
              })}
            </div>

            {saveState.error ? (
              <p className="text-sm text-destructive">
                {t(`sageErrors.${saveState.error}`, {
                  defaultValue: t("sageErrors.save_failed"),
                })}
              </p>
            ) : null}

            <Button type="submit" size="sm" disabled={savePending}>
              {savePending ? t("sageSaving") : t("sageSave")}
            </Button>
          </form>
        </div>
      ) : configured ? (
        <p className="text-sm text-muted-foreground">{t("sageNotConnected")}</p>
      ) : null}
    </IntegrationPanel>
  );
}
