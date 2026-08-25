import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SignContractForm } from "@/components/contracts/sign-contract-form";
import { Link } from "@/i18n/navigation";
import {
  assertPortalProjectAccess,
  getPortalSession,
} from "@/lib/portal/auth";
import { getProjectContractGate } from "@/lib/contracts/project-contracts";
import { loadPublicSignPayload } from "@/lib/contracts/sign";
import { redirect } from "@/i18n/navigation";

export default async function PortalProjectContractGate({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getPortalSession();
  if (!session) {
    redirect({ href: "/portal", locale });
    return null;
  }

  try {
    await assertPortalProjectAccess(session, id);
  } catch {
    notFound();
  }

  const t = await getTranslations("portal.contractGate");
  const gate = await getProjectContractGate(id, session.personId);
  if (!gate.locked) {
    redirect({ href: `/portal/projects/${id}`, locale });
    return null;
  }

  if (!gate.signToken) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="mt-3 text-[15px] text-muted-foreground">{t("waiting")}</p>
        <Link
          href="/portal/home"
          className="mt-6 inline-flex text-sm font-medium text-action hover:underline"
        >
          ← {t("backHome")}
        </Link>
      </div>
    );
  }

  const payload = await loadPublicSignPayload(gate.signToken);

  if (!payload) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="mt-3 text-[15px] text-muted-foreground">{t("missing")}</p>
        <Link
          href="/portal/home"
          className="mt-6 inline-flex text-sm font-medium text-action hover:underline"
        >
          ← {t("backHome")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="space-y-3 pb-6">
        <p className="text-sm font-medium text-muted-foreground">{t("title")}</p>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {payload.title}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("subtitle")}</p>
      </header>
      <SignContractForm payload={payload} token={gate.signToken} />
    </div>
  );
}
