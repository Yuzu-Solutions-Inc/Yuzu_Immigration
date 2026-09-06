"use client";

import { useTranslations } from "next-intl";

import { Switch } from "@/components/ui/switch";
import {
  PRACTICE_MODULE_IDS,
  hasAnyPracticeModule,
  togglePracticeBundle,
  type ModuleId,
} from "@/lib/modules/catalog";

const STANDALONE_MODULES: ModuleId[] = ["finance", "immigration", "payments"];

function ModuleRow({
  title,
  help,
  checked,
  onCheckedChange,
  switchLabel,
}: {
  title: string;
  help: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  switchLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-brand">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{help}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        aria-label={switchLabel}
      />
    </div>
  );
}

export function ModulePicker({
  enabled,
  onChange,
}: {
  enabled: Set<ModuleId>;
  onChange: (next: Set<ModuleId>) => void;
}) {
  const t = useTranslations("modules");
  const practiceOn = hasAnyPracticeModule(enabled);

  function toggleStandalone(id: ModuleId, on: boolean) {
    const next = new Set(enabled);
    if (on) next.add(id);
    else next.delete(id);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      {STANDALONE_MODULES.slice(0, 2).map((id) => (
        <div
          key={id}
          className="rounded-xl border border-border bg-canvas"
        >
          <ModuleRow
            title={t(`items.${id}.name`)}
            help={t(`items.${id}.help`)}
            checked={enabled.has(id)}
            onCheckedChange={(checked) => toggleStandalone(id, checked)}
            switchLabel={t(`items.${id}.name`)}
          />
        </div>
      ))}

      <div className="overflow-hidden rounded-xl border border-border bg-canvas">
        <ModuleRow
          title={t("groups.practice.name")}
          help={t("groups.practice.help")}
          checked={practiceOn}
          onCheckedChange={(checked) =>
            onChange(togglePracticeBundle(enabled, checked))
          }
          switchLabel={t("groups.practice.name")}
        />
        <ul className="space-y-2 border-t border-border px-4 py-3">
          {PRACTICE_MODULE_IDS.map((id) => (
            <li key={id} className="min-w-0">
              <p className="text-sm font-medium text-brand">
                {t(`items.${id}.name`)}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {t(`items.${id}.help`)}
              </p>
            </li>
          ))}
        </ul>
      </div>

      {STANDALONE_MODULES.slice(2).map((id) => (
        <div
          key={id}
          className="rounded-xl border border-border bg-canvas"
        >
          <ModuleRow
            title={t(`items.${id}.name`)}
            help={t(`items.${id}.help`)}
            checked={enabled.has(id)}
            onCheckedChange={(checked) => toggleStandalone(id, checked)}
            switchLabel={t(`items.${id}.name`)}
          />
        </div>
      ))}
    </div>
  );
}
