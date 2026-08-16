import { setRequestLocale } from "next-intl/server";

import { ShareFillWorkspace } from "@/components/forms/share-fill-workspace";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { ShareLinkGate } from "@/components/forms/share-link-gate";
import { formatShareLinkExpiryDate } from "@/lib/ircc/share-dates";
import { loadShareFillGate } from "@/lib/ircc/share-fill-gate";

export default async function ClientFillLandingPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; token: string }>;
  searchParams: Promise<{ shareError?: string }>;
}) {
  const { locale, token } = await params;
  const { shareError } = await searchParams;
  setRequestLocale(locale);

  try {
    const gate = await loadShareFillGate(token);
    if (!gate) return <ShareFillExpired />;
    if (gate.access !== "authenticated") {
      return (
        <ShareLinkGate
          token={token}
          locale={locale}
          mode={gate.access}
          projectTitle={gate.projectTitle}
          expiresLabel={formatShareLinkExpiryDate(gate.expiresAt, locale)}
          initialError={shareError}
        />
      );
    }

    return <ShareFillWorkspace token={token} />;
  } catch (err) {
    console.error("ClientFillLandingPage:", err);
    return <ShareFillExpired />;
  }
}
