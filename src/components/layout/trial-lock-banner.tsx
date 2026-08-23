import { getTranslations } from "next-intl/server";

import { isAdmin } from "@/lib/auth/rbac";
import type { OrgRole } from "@/lib/auth/rbac";
import { Link } from "@/i18n/navigation";

export async function TrialLockBanner({ role }: { role: OrgRole }) {
  const t = await getTranslations("trialLock");
  const admin = isAdmin(role);

  return (
    <div className="mb-4 rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-sm font-medium text-brand">{t("title")}</p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground text-pretty">
        {admin ? t("adminBody") : t("caseManagerBody")}
      </p>
      {admin ? (
        <p className="mt-2 text-sm">
          <Link
            href="/settings/billing"
            className="font-medium text-action hover:underline"
          >
            {t("adminCta")}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
