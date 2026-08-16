import { setRequestLocale } from "next-intl/server";

import { ShareFillTopBar } from "@/components/forms/share-fill-top-bar";
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

  return (
    <div className="flex min-h-full flex-1 flex-col bg-canvas">
      <ShareFillTopBar
        organizationName={header?.organizationName}
        representativeName={header?.representativeName}
      />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
