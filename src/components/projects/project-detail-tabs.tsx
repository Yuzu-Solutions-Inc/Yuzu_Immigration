"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

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

function isProjectDetailTab(value: string): value is ProjectDetailTab {
  return (TAB_VALUES as readonly string[]).includes(value);
}

function resolveTabFromHash(hash: string): ProjectDetailTab | null {
  if (isProjectDetailTab(hash)) return hash;
  return HASH_ALIASES[hash] ?? null;
}

export function ProjectDetailTabs({
  panels,
  className,
}: {
  panels: Record<ProjectDetailTab, ReactNode>;
  className?: string;
}) {
  const t = useTranslations("projects.detailTabs");
  const [tab, setTab] = useState<ProjectDetailTab>("home");

  useEffect(() => {
    const syncFromHash = () => {
      const resolved = resolveTabFromHash(
        window.location.hash.replace(/^#/, ""),
      );
      if (resolved) setTab(resolved);
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isProjectDetailTab(value)) {
          setTab(value);
          window.location.hash = value;
        }
      }}
      className={cn("gap-3", className)}
    >
      <TabsList
        variant="line"
        className="h-auto w-full justify-start gap-0 overflow-x-auto rounded-none border-b border-border bg-transparent p-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {TAB_VALUES.map((value) => (
          <TabsTrigger
            key={value}
            value={value}
            className={cn(
              "shrink-0 rounded-none border-b-2 border-transparent px-2 py-2 text-sm font-medium text-muted-foreground transition-colors",
              "hover:text-brand",
              "data-active:border-action data-active:bg-action/5 data-active:font-semibold data-active:text-brand",
              "after:hidden",
            )}
          >
            {t(value)}
          </TabsTrigger>
        ))}
      </TabsList>

      {TAB_VALUES.map((value) => (
        <TabsContent key={value} value={value} className="min-w-0">
          <div className="mx-auto w-full max-w-3xl space-y-6">{panels[value]}</div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
