import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import { SurfaceCard } from "@/components/layout/surface-card";
import { Link } from "@/i18n/navigation";

function InfoField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[15px] text-brand">{value}</dd>
    </div>
  );
}

export async function PersonHomeTab({
  partnerId,
  email,
  phone,
  preferredLocaleLabel,
  immigrationStatusLabel,
  sageAddressLabel,
  portal,
  projects,
}: {
  partnerId: string;
  email: string;
  phone: string;
  preferredLocaleLabel: string;
  immigrationStatusLabel: string;
  sageAddressLabel: string;
  portal: ReactNode;
  projects: ReactNode;
}) {
  const t = await getTranslations("people");

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {t("infoTitle")}
          </h2>
          <Link
            href={`/partners/${partnerId}/edit`}
            className="text-sm font-medium text-action hover:underline"
          >
            {t("edit")}
          </Link>
        </div>
        <SurfaceCard>
          <dl className="grid gap-4 sm:grid-cols-2">
            <InfoField label={t("email")} value={email} />
            <InfoField label={t("phone")} value={phone} />
            <InfoField
              label={t("preferredLocale")}
              value={preferredLocaleLabel}
            />
            <InfoField
              label={t("immigrationStatus")}
              value={immigrationStatusLabel}
            />
            <InfoField
              label={t("sageAddress")}
              value={sageAddressLabel}
              className="sm:col-span-2"
            />
          </dl>
        </SurfaceCard>
      </section>

      {portal}

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("projects")}
        </h2>
        {projects}
      </section>
    </div>
  );
}
