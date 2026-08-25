import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { ClientDocumentsUpload } from "@/components/documents/client-documents-upload";
import { ClientFillForm } from "@/components/forms/client-fill-form";
import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import { ClientFillTabs } from "@/components/forms/client-fill-tabs";
import { Link } from "@/i18n/navigation";
import { seedProjectDocumentDefaults } from "@/lib/documents/share-seed";
import { listClientDocumentRequests } from "@/lib/documents/service";
import { toProjectFormLanguage } from "@/lib/ircc/form-language";
import { loadProjectFillContext } from "@/lib/ircc/project-forms";
import {
  assertPortalProjectAccess,
  getPortalSession,
} from "@/lib/portal/auth";
import { getProjectContractGate } from "@/lib/contracts/project-contracts";
import { createServiceClient } from "@/lib/supabase/admin";

export default async function PortalProjectPage({
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

  const gate = await getProjectContractGate(id, session.personId);
  if (gate.locked) {
    redirect({ href: `/portal/projects/${id}/contract`, locale });
    return null;
  }

  const ctx = await loadProjectFillContext({
    organizationId: session.organizationId,
    projectId: id,
  });
  if (!ctx) notFound();

  try {
    await seedProjectDocumentDefaults({
      organizationId: ctx.organizationId,
      projectId: ctx.projectId,
      programFamily: String(ctx.project.program_family ?? "other"),
      personIds: ctx.people.map((person) => person.id),
    });
  } catch (err) {
    console.error("PortalProjectPage seed:", err);
  }

  const requests = await listClientDocumentRequests(
    createServiceClient(),
    ctx.projectId,
  );
  const t = await getTranslations("portal");
  const td = await getTranslations("documents");

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
      <header className="space-y-3 pb-6">
        <Link
          href="/portal/home"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backHome")}
        </Link>
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {String(ctx.project.title)}
        </h1>
        <p className="text-[15px] text-muted-foreground">{td("clientLede")}</p>
      </header>

      <section className="border-t border-border pt-6">
        <ClientFillTabs
          panels={{
            documents: (
              <ClientDocumentsUpload
                projectId={id}
                people={documentPeople}
                requests={requests}
              />
            ),
            forms: (
              <ClientFillForm
                projectId={id}
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
