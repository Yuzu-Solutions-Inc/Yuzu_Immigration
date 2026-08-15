import { getTranslations } from "next-intl/server";

import { ClientPrivacyNotice } from "@/components/legal/client-privacy-notice";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { Link } from "@/i18n/navigation";
import { seedShareDocumentDefaults } from "@/lib/documents/share-seed";
import { listShareDocumentRequests } from "@/lib/documents/service";
import { loadShareContext } from "@/lib/ircc/project-forms";
import { createServiceClient } from "@/lib/supabase/admin";

export async function ShareFillLanding({ token }: { token: string }) {
  try {
    const t = await getTranslations("documents");
    const tf = await getTranslations("forms");
    const ctx = await loadShareContext(token);

    if (!ctx) {
      return <ShareFillExpired />;
    }

    await seedShareDocumentDefaults({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      programFamily: String(ctx.project.program_family ?? "other"),
      personIds: ctx.people.map((p) => p.id),
    });

    const admin = createServiceClient();
    let requests: Awaited<ReturnType<typeof listShareDocumentRequests>> = [];
    try {
      requests = await listShareDocumentRequests(admin, ctx.projectId);
    } catch (err) {
      console.error("ShareFillLanding listShareDocumentRequests:", err);
    }
    const uploadedCount = requests.filter((r) => r.file).length;
    const requestedCount = requests.length;

    return (
      <div className="mx-auto max-w-2xl space-y-8 px-4 py-10">
        <header className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("clientEyebrow")}
          </p>
          <h1 className="font-heading text-3xl font-semibold text-brand">
            {String(ctx.project.title)}
          </h1>
          <p className="text-[15px] text-muted-foreground">{t("clientLede")}</p>
          <p className="text-sm text-muted-foreground">
            {tf("clientExpires", {
              date: new Date(ctx.expiresAt).toLocaleDateString(),
            })}
          </p>
        </header>

        <ClientPrivacyNotice token={token} />

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
                uploaded: uploadedCount,
                total: requestedCount,
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
