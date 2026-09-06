import { listPartnersAction } from "@/app/actions/finance-partners";
import { PartnersPage } from "@/components/finance/screens/PartnersPage";
import { getPrimaryMembership } from "@/lib/auth/session";
import { isModuleEnabled } from "@/lib/modules/org-modules";
import { setRequestLocale } from "next-intl/server";

export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const membership = await getPrimaryMembership();
  const rows = await listPartnersAction();
  return (
    <PartnersPage
      initialRows={rows}
      financeOn={isModuleEnabled(membership?.enabledModules ?? [], "finance")}
      immigrationOn={isModuleEnabled(membership?.enabledModules ?? [], "immigration")}
    />
  );
}
