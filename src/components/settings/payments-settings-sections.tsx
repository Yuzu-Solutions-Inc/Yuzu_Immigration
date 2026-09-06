"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { HashDetailTabs } from "@/components/layout/hash-detail-tabs";

export function PaymentsSettingsSections({
  processors,
  sage,
  defaultValue = "processors",
}: {
  processors: ReactNode;
  sage: ReactNode;
  defaultValue?: "processors" | "sage";
}) {
  const t = useTranslations("settings.sections");

  return (
    <HashDetailTabs
      values={["processors", "sage"] as const}
      defaultValue={defaultValue}
      aliases={{ stripe: "processors", square: "processors" }}
      labels={{
        processors: t("processors"),
        sage: t("sage"),
      }}
      panels={{ processors, sage }}
    />
  );
}
