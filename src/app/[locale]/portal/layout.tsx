import { cookies } from "next/headers";
import { setRequestLocale } from "next-intl/server";

import { PortalTopBar } from "@/components/portal/portal-top-bar";
import { loadPortalHeader } from "@/lib/portal/queries";
import { PORTAL_SESSION_COOKIE } from "@/lib/portal/session";
import { noIndexMetadata } from "@/lib/seo";

export const metadata = noIndexMetadata;

export default async function PortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const signedIn = Boolean((await cookies()).get(PORTAL_SESSION_COOKIE)?.value);
  const header = signedIn ? await loadPortalHeader() : null;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <PortalTopBar
        organizationName={header?.organizationName}
        personName={header?.personName}
        showSignOut={Boolean(header)}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
