"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { docsPercent, ProgressMeter } from "@/components/home/progress-meter";
import { cn } from "@/lib/utils";

function openProjectTab(tab: string) {
  window.location.hash = tab;
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}

function KpiCard({
  label,
  valueLabel,
  percent,
  onClick,
}: {
  label: string;
  valueLabel: string;
  percent: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border border-border bg-surface p-5 text-left shadow-elevated transition-colors",
        "hover:border-action/30 hover:bg-muted/30 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none",
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <div className="mt-3">
        <ProgressMeter valueLabel={valueLabel} percent={percent} />
      </div>
    </button>
  );
}

export function ProjectHomeTab({
  docsDone,
  docsTotal,
  formPercent,
  clientLink,
  participants,
}: {
  docsDone: number;
  docsTotal: number;
  formPercent: number;
  clientLink: ReactNode;
  participants: ReactNode;
}) {
  const t = useTranslations("projects");

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <KpiCard
          label={t("columnDocuments")}
          valueLabel={t("docsProgress", { done: docsDone, total: docsTotal })}
          percent={docsPercent(docsDone, docsTotal)}
          onClick={() => openProjectTab("documents")}
        />
        <KpiCard
          label={t("columnForms")}
          valueLabel={t("formsProgress", { percent: formPercent })}
          percent={formPercent}
          onClick={() => openProjectTab("forms")}
        />
      </div>

      {clientLink}
      {participants}
    </div>
  );
}
