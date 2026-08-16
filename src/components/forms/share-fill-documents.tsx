import { getTranslations } from "next-intl/server";

import { ClientDocumentsUpload } from "@/components/documents/client-documents-upload";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { Link } from "@/i18n/navigation";
import { seedShareDocumentDefaults } from "@/lib/documents/share-seed";
import { listShareDocumentRequests } from "@/lib/documents/service";
import { loadShareContext } from "@/lib/ircc/project-forms";
import { createServiceClient } from "@/lib/supabase/admin";

export async function ShareFillDocuments({ token }: { token: string }) {
  const t = await getTranslations("documents");
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

  const requests = await listShareDocumentRequests(
    createServiceClient(),
    ctx.projectId,
  );

  const people = ctx.people.map((person) => ({
    id: person.id,
    displayName: `${person.firstName} ${person.lastName}`.trim(),
    role: person.role,
  }));

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <Link
          href={`/fill/${token}`}
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backToLanding")}
        </Link>
      </div>
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {t("clientEyebrow")}
        </p>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("landingDocumentsTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {String(ctx.project.title)}
        </p>
      </header>

      <ClientDocumentsUpload
        token={token}
        people={people}
        requests={requests}
      />
    </div>
  );
}
