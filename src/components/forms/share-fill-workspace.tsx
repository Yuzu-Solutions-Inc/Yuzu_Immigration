import { getLocale, getTranslations } from "next-intl/server";

import { ClientDocumentsUpload } from "@/components/documents/client-documents-upload";
import { ClientFillForm } from "@/components/forms/client-fill-form";
import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { ShareFillHeader } from "@/components/forms/share-fill-header";
import { ShareFillTabs } from "@/components/forms/share-fill-tabs";
import { seedShareDocumentDefaults } from "@/lib/documents/share-seed";
import { listShareDocumentRequests } from "@/lib/documents/service";
import { formatShareLinkExpiryDate } from "@/lib/ircc/share-dates";
import { toProjectFormLanguage } from "@/lib/ircc/form-language";
import { loadShareContext } from "@/lib/ircc/project-forms";
import { createServiceClient } from "@/lib/supabase/admin";

export async function ShareFillWorkspace({ token }: { token: string }) {
  const locale = await getLocale();
  const t = await getTranslations("documents");
  const ctx = await loadShareContext(token);

  if (!ctx) {
    return <ShareFillExpired />;
  }

  try {
    await seedShareDocumentDefaults({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      programFamily: String(ctx.project.program_family ?? "other"),
      personIds: ctx.people.map((person) => person.id),
    });
  } catch (err) {
    console.error("ShareFillWorkspace seed:", err);
  }

  const requests = await listShareDocumentRequests(
    createServiceClient(),
    ctx.projectId,
  );

  const questionnairePeople: QuestionnairePerson[] = ctx.people.map((person) => ({
    id: person.id,
    displayName: `${person.firstName} ${person.lastName}`.trim(),
    role: person.role,
    formCodes: person.formCodes,
    answers: person.answers,
  }));

  const documentPeople = ctx.people.map((person) => ({
    id: person.id,
    displayName: `${person.firstName} ${person.lastName}`.trim(),
    role: person.role,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="space-y-5 pb-6">
        <ShareFillHeader
          projectTitle={String(ctx.project.title)}
          expiresLabel={formatShareLinkExpiryDate(ctx.expiresAt, locale)}
        />
        <p className="text-[15px] text-muted-foreground">
          {t("clientLede")}
        </p>
      </header>

      <section className="border-t border-border pt-6">
        <ShareFillTabs
          panels={{
            documents: (
              <ClientDocumentsUpload
                token={token}
                people={documentPeople}
                requests={requests}
              />
            ),
            forms: (
              <ClientFillForm
                token={token}
                people={questionnairePeople}
                formLanguage={toProjectFormLanguage(ctx.project.form_language)}
                initialSubmittedAt={ctx.questionnaireSubmittedAt}
              />
            ),
          }}
        />
      </section>
    </div>
  );
}
