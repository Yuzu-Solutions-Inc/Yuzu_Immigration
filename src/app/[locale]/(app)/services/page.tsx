import { setRequestLocale } from "next-intl/server";

import { ServicesManager } from "@/components/booking/services-manager";
import { canCreateRecords } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { listBookingForms, listBookingServices, listServiceEmailAutomations, listServiceFormFields } from "@/lib/booking/queries";
import { listContractTemplates } from "@/lib/contracts/queries";

export default async function ServicesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const membership = await getPrimaryMembership();
  const [services, forms, automations, formFields, templates] = await Promise.all([
    listBookingServices(),
    listBookingForms(),
    listServiceEmailAutomations(),
    listServiceFormFields(),
    listContractTemplates(),
  ]);

  return (
    <ServicesManager
      locale={locale}
      orgDefaultLocale={membership?.organization.defaultLocale ?? "en"}
      canManage={canCreateRecords(membership?.role)}
      services={services}
      forms={forms}
      automations={automations}
      formFields={formFields}
      templates={templates}
    />
  );
}
