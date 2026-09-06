"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateOrganizationModulesAction,
  type UpdateModulesState,
} from "@/app/actions/org-modules";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, FieldSuccess, FormStack } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { MODULE_IDS, type ModuleId } from "@/lib/modules/catalog";

const initialState: UpdateModulesState = {};

export function OrganizationModulesForm({
  initialEnabled,
}: {
  initialEnabled: ModuleId[];
}) {
  const t = useTranslations("modules");
  const [enabled, setEnabled] = useState<Set<ModuleId>>(
    () => new Set(initialEnabled),
  );
  const [state, formAction, pending] = useActionState(
    updateOrganizationModulesAction,
    initialState,
  );

  function toggle(id: ModuleId, on: boolean) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const errorMessage = state.error
    ? {
        payments_needs_charge_source: t("errors.paymentsNeedsSource"),
        missing_dependency: t("errors.missingDependency"),
        save_failed: t("errors.saveFailed"),
        forbidden: t("errors.forbidden"),
      }[state.error] ?? t("errors.saveFailed")
    : null;

  return (
    <FormStack action={formAction}>
      {MODULE_IDS.map((id) => (
        <div
          key={id}
          className="flex items-start justify-between gap-4 rounded-xl border border-border bg-canvas px-4 py-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-brand">{t(`items.${id}.name`)}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(`items.${id}.help`)}
            </p>
          </div>
          <Switch
            checked={enabled.has(id)}
            onCheckedChange={(checked) => toggle(id, checked)}
            aria-label={t(`items.${id}.name`)}
          />
        </div>
      ))}
      {[...enabled].map((id) => (
        <input key={id} type="hidden" name="module" value={id} />
      ))}
      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      {state.ok ? <FieldSuccess>{t("saved")}</FieldSuccess> : null}
      <FieldHint>{t("disableKeepsData")}</FieldHint>
      <Button type="submit" disabled={pending}>
        {pending ? t("saving") : t("save")}
      </Button>
    </FormStack>
  );
}
