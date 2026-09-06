"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function HashDetailTabs<T extends string>({
  values,
  labels,
  aliases,
  panels,
  defaultValue,
  className,
}: {
  values: readonly T[];
  labels: Record<T, string>;
  aliases?: Record<string, T>;
  panels: Record<T, ReactNode>;
  defaultValue: T;
  className?: string;
}) {
  const [tab, setTab] = useState<T>(defaultValue);

  useEffect(() => {
    const isTab = (value: string): value is T =>
      (values as readonly string[]).includes(value);

    const resolveFromHash = (hash: string): T | null => {
      if (isTab(hash)) return hash;
      const aliased = aliases?.[hash];
      return aliased && isTab(aliased) ? aliased : null;
    };

    const syncFromHash = () => {
      const resolved = resolveFromHash(window.location.hash.replace(/^#/, ""));
      if (resolved) setTab(resolved);
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [aliases, values]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (!hash || hash === tab) return;
    let cancelled = false;
    const frame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        if (!cancelled) {
          document.getElementById(hash)?.scrollIntoView({ block: "start" });
        }
      });
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [tab]);

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if ((values as readonly string[]).includes(value)) {
          const next = value as T;
          setTab(next);
          window.location.hash = next;
        }
      }}
      className={cn("w-full gap-6", className)}
    >
      <div className="-mx-1 w-full overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <TabsList className="group-data-horizontal/tabs:h-auto h-auto w-max max-w-none justify-start gap-1 p-0">
          {values.map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className={cn(
                "!h-auto min-h-8 !flex-none shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors",
                "hover:text-brand",
                "data-active:bg-action/10 data-active:text-action data-active:font-semibold data-active:shadow-none",
              )}
            >
              {labels[value]}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {values.map((value) => (
        <TabsContent
          key={value}
          value={value}
          id={value}
          className="min-w-0 w-full scroll-mt-6"
        >
          <div className="w-full space-y-6">{panels[value]}</div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
