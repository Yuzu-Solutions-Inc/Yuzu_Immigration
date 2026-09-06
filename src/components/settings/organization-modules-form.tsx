"use client";

import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  updateOrganizationModulesAction,
  type UpdateModulesState,
} from "@/app/actions/org-modules";
import { ModulePicker } from "@/components/settings/module-picker";
import { Button } from "@/components/ui/button";
import { FieldError, FieldHint, FieldSuccess, FormStack } from "@/components/ui/field";
import {
  normalizeModuleSelection,
  type ModuleId,
} from "@/lib/modules/catalog";

const initialState: UpdateModulesState = {};

export function OrganizationModulesForm({
  initialEnabled,
}: {
  initialEnabled: ModuleId[];
}) {
  const t = useTranslations("modules");
  const [enabled, setEnabled] = useState<Set<ModuleId>>(
    () => new Set(normalizeModuleSelection(initialEnabled)),
  );
  const [state, formAction, pending] = useActionState(
    updateOrganizationModulesAction,
    initialState,
  );

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
      <ModulePicker enabled={enabled} onChange={setEnabled} />
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
