"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { HashDetailTabs } from "@/components/layout/hash-detail-tabs";

const TAB_VALUES = [
  "home",
  "documents",
  "forms",
  "communication",
  "payments",
] as const;

export type ProjectDetailTab = (typeof TAB_VALUES)[number];

const HASH_ALIASES: Record<string, ProjectDetailTab> = {
  participants: "home",
  share: "home",
  calls: "communication",
  notes: "communication",
};

export function ProjectDetailTabs({
  panels,
  className,
}: {
  panels: Record<ProjectDetailTab, ReactNode>;
  className?: string;
}) {
  const t = useTranslations("projects.detailTabs");

  return (
    <HashDetailTabs
      values={TAB_VALUES}
      defaultValue="home"
      aliases={HASH_ALIASES}
      labels={{
        home: t("home"),
        documents: t("documents"),
        forms: t("forms"),
        communication: t("communication"),
        payments: t("payments"),
      }}
      panels={panels}
      className={className}
    />
  );
}
