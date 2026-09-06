"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { HashDetailTabs } from "@/components/layout/hash-detail-tabs";

export function BillingSettingsSections({
  plan,
  team,
}: {
  plan: ReactNode;
  team: ReactNode;
}) {
  const t = useTranslations("settings.sections");

  return (
    <HashDetailTabs
      values={["plan", "team"] as const}
      defaultValue="plan"
      aliases={{ billing: "plan" }}
      labels={{
        plan: t("plan"),
        team: t("team"),
      }}
      panels={{ plan, team }}
    />
  );
}
