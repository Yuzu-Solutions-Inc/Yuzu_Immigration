"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const TAB_VALUES = [
  "participants",
  "documents",
  "forms",
  "share",
  "calls",
  "payments",
  "notes",
] as const;

export type ProjectDetailTab = (typeof TAB_VALUES)[number];

function isProjectDetailTab(value: string): value is ProjectDetailTab {
  return (TAB_VALUES as readonly string[]).includes(value);
}

export function ProjectDetailTabs({
  panels,
  className,
}: {
  panels: Record<ProjectDetailTab, ReactNode>;
  className?: string;
}) {
  const t = useTranslations("projects.detailTabs");
  const [tab, setTab] = useState<ProjectDetailTab>("participants");

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (isProjectDetailTab(hash)) {
      setTab(hash);
    }
  }, []);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isProjectDetailTab(value)) setTab(value);
      }}
      className={cn("gap-4", className)}
    >
      <TabsList
        variant="line"
        className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TAB_VALUES.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            className="shrink-0 rounded-none px-3 py-2.5 after:bottom-0"
          >
            {t(value)}
          </TabsTrigger>
        ))}
      </TabsList>

      {TAB_VALUES.map((value) => (
        <TabsContent key={value} value={value} className="min-w-0 space-y-6">
          {panels[value]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
