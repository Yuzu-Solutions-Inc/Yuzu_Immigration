"use server";

import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";

import { SignContractForm } from "@/components/contracts/sign-contract-form";
import { PortalProjectContractForm } from "@/components/portal/portal-project-contract-form";
import { Link } from "@/i18n/navigation";
import {
  assertPortalProjectAccess,
  getPortalSession,
} from "@/lib/portal/auth";
import type { BookingFormFieldRow } from "@/lib/booking/types";
import {
  getProjectContractGate,
  issueProjectContract,
} from "@/lib/contracts/project-contracts";
import { loadPublicSignPayload } from "@/lib/contracts/sign";
import { createServiceClient } from "@/lib/supabase/admin";
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
  let gate = await getProjectContractGate(id, session.personId);

  // Form already submitted but envelope missing (retry after a prior issue failure).
  if (
    gate.locked &&
    !gate.needsForm &&
    !gate.signToken &&
    gate.contract?.form_submitted_at &&
    gate.contract.status === "pending_signature"
  ) {
    try {
      await issueProjectContract(gate.contract.id);
      gate = await getProjectContractGate(id, session.personId);
    } catch (err) {
      console.error("portal contract reissue:", err);
    }
  }

  if (!gate.locked) {
    redirect({ href: `/portal/projects/${id}`, locale });
    return null;
  }

  if (gate.needsForm && gate.contract?.form_id) {
    const admin = createServiceClient();
    const { data: principal } = await admin
      .from("project_participants")
      .select("id")
      .eq("project_id", id)
      .eq("person_id", session.personId)
      .eq("role", "principal")
      .is("left_at", null)
      .maybeSingle();

    if (!principal) {
      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-12">
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("title")}
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            {t("waitingForm")}
          </p>
          <Link
            href="/portal/home"
            className="mt-6 inline-flex text-sm font-medium text-action hover:underline"
          >
            ← {t("backHome")}
          </Link>
        </div>
      );
    }

    const [{ data: form }, { data: fields }] = await Promise.all([
      admin
        .from("booking_forms")
        .select("id, title")
        .eq("id", gate.contract.form_id)
        .eq("organization_id", session.organizationId)
        .maybeSingle(),
      admin
        .from("booking_service_form_fields")
        .select("*")
        .eq("form_id", gate.contract.form_id)
        .eq("organization_id", session.organizationId)
        .order("sort_order", { ascending: true }),
    ]);

    const normalizedFields = ((fields ?? []) as BookingFormFieldRow[]).map(
      (field) => ({
        ...field,
        options: Array.isArray(field.options) ? field.options : [],
      }),
    );

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-8">
        <header className="space-y-3 pb-6">
          <p className="text-sm font-medium text-muted-foreground">{t("title")}</p>
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t("formStepTitle")}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("formStepSubtitle")}</p>
        </header>
        <PortalProjectContractForm
          locale={locale}
          projectId={id}
          contractId={gate.contract.id}
          formTitle={form?.title || t("formUntitled")}
          fields={normalizedFields}
        />
      </div>
    );
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
      <SignContractForm
        payload={payload}
        token={gate.signToken}
        successHref={`/${locale}/portal/projects/${id}`}
      />
    </div>
  );
}
