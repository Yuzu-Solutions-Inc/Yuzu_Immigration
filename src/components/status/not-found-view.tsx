import { getTranslations } from "next-intl/server";

import { StatusPage } from "@/components/status/status-page";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export async function NotFoundView({
  homeHref,
  showSignIn = false,
}: {
  homeHref: "/" | "/home";
  showSignIn?: boolean;
}) {
  const t = await getTranslations("statusPages");

  return (
    <StatusPage
      code={t("notFoundCode")}
      title={t("notFoundTitle")}
      body={t("notFoundBody")}
      compact={homeHref === "/home"}
      logoHref={homeHref}
      actions={
        <>
          <Link href={homeHref} className={cn(buttonVariants())}>
            {t("notFoundHome")}
          </Link>
          {showSignIn ? (
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              {t("notFoundSignIn")}
            </Link>
          ) : null}
        </>
      }
    />
  );
}
