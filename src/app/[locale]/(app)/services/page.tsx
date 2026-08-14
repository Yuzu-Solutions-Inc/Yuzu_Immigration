import { setRequestLocale } from "next-intl/server";

import { ServicesManager } from "@/components/booking/services-manager";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listBookingServices, listServiceEmailAutomations, listServiceFormFields } from "@/lib/booking/queries";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  const [services, automations, formFields] = await Promise.all([
    listBookingServices(),
    listServiceEmailAutomations(),
    listServiceFormFields(),
  ]);

  return (
    <ServicesManager
      locale={locale}
      canManage={canCreateRecords(membership?.role)}
      services={services}
      automations={automations}
      formFields={formFields}
    />
  );
}
