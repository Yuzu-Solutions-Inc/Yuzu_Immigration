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
      className={cn("mx-auto w-full max-w-3xl gap-6", className)}
    >
      <div className="-mx-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList className="group-data-horizontal/tabs:h-auto h-auto w-max max-w-none justify-start gap-1 p-0">
          {TAB_VALUES.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "!h-auto min-h-8 !flex-none shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                "hover:text-brand",
                "data-active:bg-action/10 data-active:text-action data-active:font-semibold data-active:shadow-none",
              )}
            >
              {t(value)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {TAB_VALUES.map((value) => (
        <TabsContent key={value} value={value} className="min-w-0">
          <div className="space-y-6">{panels[value]}</div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
