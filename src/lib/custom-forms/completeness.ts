import { matchesShowWhen } from "@/lib/forms/visibility";
import {
  isAnswerFilled,
  isCustomFieldVisible,
  isCustomSectionVisible,
  type CustomField,
  type CustomFormSchema,
  type ProjectCustomFormRow,
} from "@/lib/custom-forms/schema";
import type { CustomAnswersStore } from "@/lib/custom-forms/answers";
import { answersForCustomFill } from "@/lib/custom-forms/answers";

export type CustomFillCounts = {
  filled: number;
  total: number;
  percent: number;
};

function visibleRequiredFields(
  schema: CustomFormSchema,
  answers: Record<string, unknown>,
): CustomField[] {
  const out: CustomField[] = [];
  for (const section of schema.sections) {
    if (!isCustomSectionVisible(section, answers)) continue;
    for (const field of section.fields) {
      if (!isCustomFieldVisible(field, answers)) continue;
      if (!field.required) continue;
      out.push(field);
    }
  }
  return out;
}

export function customSchemaFillCounts(
  schema: CustomFormSchema,
  answers: Record<string, unknown>,
): CustomFillCounts {
  const required = visibleRequiredFields(schema, answers);
  const total = required.length;
  const filled = required.filter((field) =>
    isAnswerFilled(answers[field.key], field.type),
  ).length;
  return {
    filled,
    total,
    percent: total === 0 ? 100 : Math.round((filled / total) * 100),
  };
}

export function customFormsFillPercent(
  forms: ProjectCustomFormRow[],
  store: CustomAnswersStore,
  people: Array<{ id: string }>,
): number {
  const required = forms.filter((form) => form.is_required);
  if (required.length === 0) return 0;

  let filled = 0;
  let total = 0;
  for (const form of required) {
    if (form.scope === "project") {
      const bag = answersForCustomFill(store, null);
      const counts = customSchemaFillCounts(form.schema, bag);
      filled += counts.filled;
      total += counts.total;
      continue;
    }
    const personIds = form.person_id
      ? [form.person_id]
      : people.map((person) => person.id);
    for (const personId of personIds) {
      const bag = answersForCustomFill(store, personId);
      const counts = customSchemaFillCounts(form.schema, bag);
      filled += counts.filled;
      total += counts.total;
    }
  }

  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

export function customFormStatusFromCounts(
  counts: CustomFillCounts,
): "todo" | "in_progress" | "ready" {
  if (counts.total === 0) return "ready";
  if (counts.filled === 0) return "todo";
  if (counts.filled >= counts.total) return "ready";
  return "in_progress";
}

export function isCustomFormReady(
  schema: CustomFormSchema,
  answers: Record<string, unknown>,
): boolean {
  return customSchemaFillCounts(schema, answers).percent === 100;
}

export function mergeVisibleAnswers(
  schema: CustomFormSchema,
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...answers };
  for (const section of schema.sections) {
    const sectionOpen = matchesShowWhen(section.showWhen, answers);
    for (const field of section.fields) {
      const visible =
        sectionOpen && isCustomFieldVisible(field, answers);
      if (!visible) continue;
      if (next[field.key] === undefined) next[field.key] = "";
    }
  }
  return next;
}
