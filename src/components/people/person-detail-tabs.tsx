"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { HashDetailTabs } from "@/components/layout/hash-detail-tabs";

const TAB_VALUES = ["home", "emails", "bookings"] as const;

export type PersonDetailTab = (typeof TAB_VALUES)[number];

const HASH_ALIASES: Record<string, PersonDetailTab> = {
  info: "home",
  portal: "home",
  projects: "home",
  mail: "emails",
  communication: "emails",
  notes: "bookings",
  meetings: "bookings",
};

export function PersonDetailTabs({
  panels,
  className,
}: {
  panels: Record<PersonDetailTab, ReactNode>;
  className?: string;
}) {
  const t = useTranslations("people.detailTabs");

  return (
    <HashDetailTabs
      values={TAB_VALUES}
      defaultValue="home"
      aliases={HASH_ALIASES}
      labels={{
        home: t("home"),
        emails: t("emails"),
        bookings: t("bookings"),
      }}
      panels={panels}
      className={className}
    />
  );
}
