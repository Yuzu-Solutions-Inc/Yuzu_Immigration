import { getTranslations } from "next-intl/server";

import { isAdmin } from "@/lib/auth/rbac";
import type { OrgRole } from "@/lib/auth/rbac";
import { product } from "@/lib/brand/product";

export async function TrialLockBanner({ role }: { role: OrgRole }) {
  const t = await getTranslations("trialLock");
  const admin = isAdmin(role);
  const mailto = `mailto:${product.supportEmail}?subject=${encodeURIComponent("Subscribe to Permit OS")}`;

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-sm font-medium text-brand">{t("title")}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
        {admin ? t("adminBody") : t("caseManagerBody")}
      </p>
      {admin ? (
        <p className="mt-2 text-sm">
          <a
            href={mailto}
            className="font-medium text-action hover:underline"
          >
            {t("adminCta", { email: product.supportEmail })}
          </a>
        </p>
      ) : null}
    </div>
  );
}
