import { getLocale } from "next-intl/server";

import { ClientDocumentsUpload } from "@/components/documents/client-documents-upload";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { ShareFillHeader } from "@/components/forms/share-fill-header";
import { formatShareLinkExpiryDate } from "@/lib/ircc/share-dates";
import { seedShareDocumentDefaults } from "@/lib/documents/share-seed";
import { listShareDocumentRequests } from "@/lib/documents/service";
import { loadShareContext } from "@/lib/ircc/project-forms";
import { createServiceClient } from "@/lib/supabase/admin";

export async function ShareFillDocuments({ token }: { token: string }) {
  const locale = await getLocale();
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
      <ShareFillHeader
        token={token}
        projectTitle={String(ctx.project.title)}
        expiresLabel={formatShareLinkExpiryDate(ctx.expiresAt, locale)}
        active="documents"
      />

      <ClientDocumentsUpload
        token={token}
        people={people}
        requests={requests}
      />
    </div>
  );
}
