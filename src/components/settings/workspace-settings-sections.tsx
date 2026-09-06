"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { HashDetailTabs } from "@/components/layout/hash-detail-tabs";

export function WorkspaceSettingsSections({
  firm,
  modules,
  company,
  legal,
}: {
  firm: ReactNode;
  modules: ReactNode;
  company?: ReactNode;
  legal: ReactNode;
}) {
  const t = useTranslations("settings.sections");

  if (!company) {
    return (
      <HashDetailTabs
        values={["firm", "modules", "legal"] as const}
        defaultValue="firm"
        labels={{
          firm: t("firm"),
          modules: t("modules"),
          legal: t("legal"),
        }}
        panels={{ firm, modules, legal }}
      />
    );
  }

  return (
    <HashDetailTabs
      values={["firm", "modules", "company", "legal"] as const}
      defaultValue="firm"
      labels={{
        firm: t("firm"),
        modules: t("modules"),
        company: t("company"),
        legal: t("legal"),
      }}
      panels={{ firm, modules, company, legal }}
    />
  );
}
