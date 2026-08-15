import { setRequestLocale } from "next-intl/server";

import { ShareFillDocuments } from "@/components/forms/share-fill-documents";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { ShareLinkGate } from "@/components/forms/share-link-gate";
import { loadShareFillGate } from "@/lib/ircc/share-fill-gate";

export default async function ClientFillDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
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
        expiresAt={gate.expiresAt}
      />
    );
  }

  return <ShareFillDocuments token={token} />;
}
