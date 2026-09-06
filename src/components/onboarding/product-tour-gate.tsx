import { Suspense } from "react";

import { ProductTourHost } from "@/components/onboarding/product-tour-host";
import { getTourPresentation } from "@/lib/onboarding/status";

export async function ProductTourGate() {
  const tour = await getTourPresentation();
  if (!tour) return null;

  return (
    <Suspense fallback={null}>
      <ProductTourHost
        enabledModules={tour.enabledModules}
        isAdmin={tour.isAdmin}
        canCreate={tour.canCreate}
        unseenModules={tour.unseenModules}
        autoStart={tour.autoStart}
      />
    </Suspense>
  );
}
