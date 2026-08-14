import type { QuestionnairePerson } from "@/components/forms/modular-questionnaire";
import type { ParticipantRow } from "@/lib/crm/queries";
import {
  answersForPersonFill,
  type ProjectAnswersStore,
} from "@/lib/ircc/answers-store";
import {
  mergeAccountRepIntoAnswers,
  type AccountRepSource,
} from "@/lib/ircc/account-rep";
import { withProjectFormLanguage } from "@/lib/ircc/form-language";
import type { ProjectFormRow } from "@/lib/ircc/project-forms";

export function buildQuestionnairePeople({
  participants,
  forms,
  store,
  formLanguage,
  repProfile,
}: {
  participants: ParticipantRow[];
  forms: ProjectFormRow[];
  store: ProjectAnswersStore;
  formLanguage: "en" | "fr";
  repProfile: AccountRepSource | null;
}): QuestionnairePerson[] {
  return participants
    .filter((row) => row.person)
    .map((row) => {
      const person = row.person!;
      const formCodes = forms
        .filter(
          (f) =>
            f.person_id === person.id ||
            (row.role === "principal" && !f.person_id),
        )
        .map((f) => f.form_code);
      const raw = answersForPersonFill(store, person.id);
      if (person.email) raw.email = person.email;
      return {
        id: person.id,
        displayName: `${person.first_name} ${person.last_name}`.trim(),
        role: row.role,
        formCodes,
        answers: withProjectFormLanguage(
          mergeAccountRepIntoAnswers(raw, repProfile),
          formLanguage,
        ),
      };
    });
}
