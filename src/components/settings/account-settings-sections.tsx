"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { HashDetailTabs } from "@/components/layout/hash-detail-tabs";

type AccountSection = "profile" | "representative" | "calendar";

export function AccountSettingsSections({
  profile,
  representative,
  calendar,
  defaultValue = "profile",
}: {
  profile: ReactNode;
  representative: ReactNode;
  calendar?: ReactNode;
  defaultValue?: AccountSection;
}) {
  const t = useTranslations("settings.sections");

  if (!calendar) {
    return (
      <HashDetailTabs
        values={["profile", "representative"] as const}
        defaultValue={
          defaultValue === "representative" ? "representative" : "profile"
        }
        aliases={{ account: "profile" }}
        labels={{
          profile: t("profile"),
          representative: t("representative"),
        }}
        panels={{ profile, representative }}
      />
    );
  }

  return (
    <HashDetailTabs
      values={["profile", "representative", "calendar"] as const}
      defaultValue={defaultValue}
      aliases={{
        account: "profile",
        hours: "calendar",
        meetings: "calendar",
      }}
      labels={{
        profile: t("profile"),
        representative: t("representative"),
        calendar: t("calendar"),
      }}
      panels={{ profile, representative, calendar }}
    />
  );
}
