import { getTranslations } from "next-intl/server";

import { ClientFillForm } from "@/components/forms/client-fill-form";
import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { Link } from "@/i18n/navigation";
import { loadShareContext } from "@/lib/ircc/project-forms";

export async function ShareFillForms({ token }: { token: string }) {
  const t = await getTranslations("forms");
  const td = await getTranslations("documents");
  const ctx = await loadShareContext(token);

  if (!ctx) {
    return <ShareFillExpired />;
  }

  const people: QuestionnairePerson[] = ctx.people.map((person) => ({
    id: person.id,
    displayName: `${person.firstName} ${person.lastName}`.trim(),
    role: person.role,
    formCodes: person.formCodes,
    answers: person.answers,
  }));

  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-6xl space-y-4 px-4 pt-6">
        <Link
          href={`/fill/${token}`}
          className="text-sm font-medium text-action hover:underline"
        >
          ← {td("backToLanding")}
        </Link>
      </div>
      <ClientFillForm
        token={token}
        people={people}
        projectTitle={String(ctx.project.title)}
        expiresAt={ctx.expiresAt}
        initialSubmittedAt={ctx.questionnaireSubmittedAt}
      />
    </div>
  );
}
