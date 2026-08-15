import { getTranslations, setRequestLocale } from "next-intl/server";

import { ShareLinkGate } from "@/components/forms/share-link-gate";
import { loadShareGateContext } from "@/lib/ircc/project-forms";

import type { ReactNode } from "react";

export async function ShareFillAccess({
  locale,
  token,
  children,
}: {
  locale: string;
  token: string;
  children: ReactNode;
}) {
  setRequestLocale(locale);
  const t = await getTranslations("forms");

  let gate;
  try {
    gate = await loadShareGateContext(token);
  } catch (err) {
    console.error("loadShareGateContext:", err);
    gate = null;
  }

  if (!gate) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("linkExpiredTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {t("linkExpiredBody")}
        </p>
      </div>
    );
  }

  if (gate.access !== "authenticated") {
    return (
      <ShareLinkGate
        token={token}
        locale={locale}
        mode={gate.access}
        organizationName={gate.organizationName}
        projectTitle={gate.projectTitle}
        expiresAt={gate.expiresAt}
      />
    );
  }

  return children;
}
