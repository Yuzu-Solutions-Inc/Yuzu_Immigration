"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const TAB_VALUES = ["documents", "forms"] as const;

export type ShareFillTab = (typeof TAB_VALUES)[number];

function isShareFillTab(value: string): value is ShareFillTab {
  return (TAB_VALUES as readonly string[]).includes(value);
}

export function ShareFillTabs({
  panels,
  className,
}: {
  panels: Record<ShareFillTab, ReactNode>;
  className?: string;
}) {
  const t = useTranslations("documents.shareTabs");
  const [tab, setTab] = useState<ShareFillTab>("documents");

  useEffect(() => {
    const syncFromHash = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (isShareFillTab(hash)) setTab(hash);
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (isShareFillTab(value)) {
          setTab(value);
          window.location.hash = value;
        }
      }}
      className={cn("w-full gap-6", className)}
    >
      <div className="-mx-1 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList
          aria-label={t("label")}
          className="group-data-horizontal/tabs:h-auto h-auto w-max max-w-none justify-start gap-1 p-0"
        >
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
        <TabsContent key={value} value={value} className="min-w-0 w-full">
          <div className="w-full space-y-6">{panels[value]}</div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
