import { setRequestLocale } from "next-intl/server";

import { ShareFillForms } from "@/components/forms/share-fill-forms";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { ShareLinkGate } from "@/components/forms/share-link-gate";
import { formatShareLinkExpiryDate } from "@/lib/ircc/share-dates";
import { loadShareFillGate } from "@/lib/ircc/share-fill-gate";

export default async function ClientFillFormsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ shareError?: string }>;
}) {
  const { locale, token } = await params;
  const { shareError } = await searchParams;
  setRequestLocale(locale);

  const gate = await loadShareFillGate(token);
  if (!gate) return <ShareFillExpired />;
  if (gate.access !== "authenticated") {
    return (
      <ShareLinkGate
        token={token}
        locale={locale}
        mode={gate.access}
        organizationName={gate.organizationName}
        projectTitle={gate.projectTitle}
        expiresLabel={formatShareLinkExpiryDate(gate.expiresAt, locale)}
        initialError={shareError}
      />
    );
  }

  return <ShareFillForms token={token} />;
}
