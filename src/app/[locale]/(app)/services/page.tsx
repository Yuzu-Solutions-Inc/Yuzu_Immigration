import { setRequestLocale } from "next-intl/server";

import { ServicesManager } from "@/components/booking/services-manager";
import { canManageBookingCatalog } from "@/lib/auth/rbac";
import { getPrimaryMembership } from "@/lib/auth/session";
import { requireServicesWorkspace } from "@/lib/modules/require-workspace";
import { listBookingForms, listBookingServices, listServiceEmailAutomations, listServiceFormFields } from "@/lib/booking/queries";
import { listContractTemplates, loadStaffContractSignature } from "@/lib/contracts/queries";

export default async function ServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ contracts?: string }>;
}) {
  const { locale } = await params;
  const { contracts } = await searchParams;
  setRequestLocale(locale);
  await requireServicesWorkspace(locale);

  const membership = await getPrimaryMembership();
  const [services, forms, automations, formFields, templates, signature] =
    await Promise.all([
    listBookingServices(),
    listBookingForms(),
    listServiceEmailAutomations(),
    listServiceFormFields(),
    listContractTemplates(),
    loadStaffContractSignature(),
  ]);

  return (
    <ServicesManager
      locale={locale}
      orgDefaultLocale={membership?.organization.defaultLocale ?? "en"}
      canManage={canManageBookingCatalog(membership?.role)}
      services={services}
      forms={forms}
      automations={automations}
      formFields={formFields}
      templates={templates}
      signature={signature}
      openContracts={contracts === "1"}
    />
  );
}
