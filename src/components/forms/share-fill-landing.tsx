import { getLocale, getTranslations } from "next-intl/server";

import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { Link } from "@/i18n/navigation";
import { seedShareDocumentDefaults } from "@/lib/documents/share-seed";
import { loadShareLandingSummary } from "@/lib/ircc/share-landing";
import { formatShareLinkExpiryDate } from "@/lib/ircc/share-dates";
import { createServiceClient } from "@/lib/supabase/admin";

async function countShareDocuments(projectId: string) {
  try {
    const admin = createServiceClient();
    const [requestsRes, filesRes] = await Promise.all([
      admin
        .from("project_document_requests")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
      admin
        .from("project_document_files")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId),
    ]);
    return {
      requested: requestsRes.count ?? 0,
      uploaded: filesRes.count ?? 0,
    };
  } catch (err) {
    console.error("countShareDocuments:", err);
    return { requested: 0, uploaded: 0 };
  }
}

export async function ShareFillLanding({ token }: { token: string }) {
  try {
    const summary = await loadShareLandingSummary(token);
    if (!summary) {
      return <ShareFillExpired />;
    }

    const locale = await getLocale();
    const t = await getTranslations("documents");
    const tf = await getTranslations("forms");

    try {
      await seedShareDocumentDefaults({
        organizationId: summary.organizationId,
        projectId: summary.projectId,
        programFamily: summary.programFamily,
        personIds: summary.personIds,
      });
    } catch (err) {
      console.error("ShareFillLanding seed:", err);
    }

    const { requested, uploaded } = await countShareDocuments(summary.projectId);

    return (
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("clientEyebrow")}
          </p>
          <h1 className="font-heading text-3xl font-semibold text-brand">
            {summary.projectTitle}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("clientLede")}</p>
          <p className="text-sm text-muted-foreground">
            {tf("clientExpires", {
              date: formatShareLinkExpiryDate(summary.expiresAt, locale),
            })}
          </p>
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href={`/fill/${token}/documents`}
            className="block rounded-xl border border-border bg-surface p-5 shadow-elevated transition-colors hover:border-action/40"
          >
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("landingDocumentsTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("landingDocumentsBody")}
            </p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-action uppercase">
              {t("landingDocumentsCta", {
                uploaded,
                total: requested,
              })}
            </p>
          </Link>

          <Link
            href={`/fill/${token}/forms`}
            className="block rounded-xl border border-border bg-surface p-5 shadow-elevated transition-colors hover:border-action/40"
          >
            <h2 className="font-heading text-lg font-semibold text-brand">
              {t("landingFormsTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("landingFormsBody")}
            </p>
            <p className="mt-4 text-xs font-semibold tracking-wide text-action uppercase">
              {t("landingFormsCta")}
            </p>
          </Link>
        </div>
      </div>
    );
  } catch (err) {
    console.error("ShareFillLanding:", err);
    return <ShareFillExpired />;
  }
}
