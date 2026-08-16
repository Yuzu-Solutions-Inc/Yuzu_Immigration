import { getLocale } from "next-intl/server";

import { ClientFillForm } from "@/components/forms/client-fill-form";
import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import { ShareFillExpired } from "@/components/forms/share-fill-expired";
import { ShareFillHeader } from "@/components/forms/share-fill-header";
import { formatShareLinkExpiryDate } from "@/lib/ircc/share-dates";
import { loadShareContext } from "@/lib/ircc/project-forms";

export async function ShareFillForms({ token }: { token: string }) {
  const locale = await getLocale();
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
    <div className="space-y-6">
      <div className="mx-auto max-w-6xl px-4 pt-6">
        <ShareFillHeader
          token={token}
          projectTitle={String(ctx.project.title)}
          expiresLabel={formatShareLinkExpiryDate(ctx.expiresAt, locale)}
          active="forms"
        />
      </div>
      <ClientFillForm
        token={token}
        people={people}
        initialSubmittedAt={ctx.questionnaireSubmittedAt}
      />
    </div>
  );
}
