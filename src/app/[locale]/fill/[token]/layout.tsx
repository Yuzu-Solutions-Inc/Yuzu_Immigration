import { setRequestLocale } from "next-intl/server";
import { cookies } from "next/headers";

import { ShareFillTopBar } from "@/components/forms/share-fill-top-bar";
import { SHARE_SESSION_COOKIE } from "@/lib/ircc/share-auth";
import { loadShareHeaderContext } from "@/lib/ircc/share-header";

export default async function ShareFillLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const header = await loadShareHeaderContext(token);
  const showSignOut = Boolean(
    (await cookies()).get(SHARE_SESSION_COOKIE)?.value,
  );

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <ShareFillTopBar
        token={token}
        organizationName={header?.organizationName}
        representativeName={header?.representativeName}
        showSignOut={showSignOut}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
