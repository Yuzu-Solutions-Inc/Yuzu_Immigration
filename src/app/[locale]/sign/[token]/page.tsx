import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";

import { SignContractForm } from "@/components/contracts/sign-contract-form";
import { loadPublicSignPayload } from "@/lib/contracts/sign";

export default async function SignContractPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("signContract");
  const payload = await loadPublicSignPayload(token);

  if (!payload) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("unavailableTitle")}
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          {t("unavailableBody")}
        </p>
      </div>
    );
  }

  return <SignContractForm token={token} payload={payload} />;
}
