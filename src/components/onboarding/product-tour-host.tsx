"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";

import { markTourModulesSeenAction } from "@/app/actions/onboarding";
import { ProductTour } from "@/components/onboarding/product-tour";
import type { ModuleId } from "@/lib/modules/catalog";
import { isModuleId } from "@/lib/modules/catalog";
import { tourStepsFor } from "@/lib/onboarding/tour";

export function ProductTourHost({
  enabledModules,
  isAdmin,
  canCreate,
  unseenModules,
  autoStart,
}: {
  enabledModules: readonly ModuleId[];
  isAdmin: boolean;
  canCreate: boolean;
  unseenModules: readonly ModuleId[];
  autoStart: boolean;
}) {
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const force = searchParams.get("tour") === "1";
  const focusParam = searchParams.get("modules");
  const [open, setOpen] = useState(autoStart || force);
  const [, startTransition] = useTransition();

  const focusModules = useMemo(() => {
    if (focusParam) {
      const parsed = focusParam.split(",").filter(isModuleId);
      return parsed.length > 0 ? parsed : undefined;
    }
    if (autoStart) return undefined;
    return unseenModules.length > 0 ? [...unseenModules] : undefined;
  }, [autoStart, focusParam, unseenModules]);

  const steps = useMemo(
    () =>
      tourStepsFor({
        enabledModules: [...enabledModules],
        isAdmin,
        canCreate,
        focusModules,
        includeCore: !focusModules,
      }),
    [canCreate, enabledModules, focusModules, isAdmin],
  );

  const closeTourParam = useCallback(() => {
    if (!force) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tour");
    params.delete("modules");
    const next = params.toString();
    router.replace(next ? `/home?${next}` : "/home");
  }, [force, router, searchParams]);

  const finish = useCallback(() => {
    setOpen(false);
    closeTourParam();
    startTransition(() => {
      void markTourModulesSeenAction(locale, focusModules);
    });
  }, [closeTourParam, focusModules, locale]);

  const skip = useCallback(() => {
    setOpen(false);
    closeTourParam();
    startTransition(() => {
      void markTourModulesSeenAction(locale);
    });
  }, [closeTourParam, locale]);

  if (!open || steps.length === 0) return null;

  return <ProductTour steps={steps} onFinish={finish} onSkip={skip} />;
}
