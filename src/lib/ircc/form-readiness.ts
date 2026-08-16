import {
  fieldsForFormCodes,
  isFieldVisible,
  isTableVisible,
  tablesForFormCodes,
} from "@/lib/ircc/fields";

function isFilled(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim() !== "";
}

function tableRows(answers: Record<string, unknown>, key: string): unknown[] {
  const value = answers[key];
  return Array.isArray(value) ? value : [];
}

/**
 * True when the questionnaire already has every required, currently visible
 * field (and table row) that this IRCC PDF needs. Shared identity/contact
 * fields count for every form; form-specific blocks (study, work, family
 * tables, …) only count for PDFs that list them.
 */
export function isFormMandatoryComplete(
  formCode: string,
  answers: Record<string, unknown>,
): boolean {
  const codes = [formCode.toLowerCase()];

  for (const field of fieldsForFormCodes(codes)) {
    if (!field.required) continue;
    if (!isFieldVisible(field, answers)) continue;
    if (!isFilled(answers[field.key])) return false;
  }

  for (const table of tablesForFormCodes(codes)) {
    if (!isTableVisible(table, answers)) continue;
    const rows = tableRows(answers, table.key);
    const minRows = table.minRows ?? 0;
    if (rows.length < minRows) return false;

    const requiredCols = table.columns.filter((col) => col.required);
    if (requiredCols.length === 0) continue;

    for (const row of rows) {
      const record =
        row && typeof row === "object" && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : {};
      for (const col of requiredCols) {
        if (!isFilled(record[col.key])) return false;
      }
    }
  }

  return true;
}

function countVisibleAnswers(
  formCodes: string[],
  answers: Record<string, unknown>,
  section?: string,
): { filled: number; total: number } {
  const codes = formCodes.map((code) => code.toLowerCase());
  let filled = 0;
  let total = 0;

  for (const field of fieldsForFormCodes(codes)) {
    if (section && field.section !== section) continue;
    if (!isFieldVisible(field, answers)) continue;
    total += 1;
    if (isFilled(answers[field.key])) filled += 1;
  }

  for (const table of tablesForFormCodes(codes)) {
    if (section && table.section !== section) continue;
    if (!isTableVisible(table, answers)) continue;
    const rows = tableRows(answers, table.key);
    const cols = table.columns.filter((col) => col.required);
    if (cols.length === 0) continue;
    const useRows = rows.length > 0 ? rows : [{}];
    for (const row of useRows) {
      const record =
        row && typeof row === "object" && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : {};
      for (const col of cols) {
        total += 1;
        if (isFilled(record[col.key])) filled += 1;
      }
    }
  }

  return { filled, total };
}

/**
 * True when every currently visible field and table cell in the section
 * has an answer. Empty sections (no visible questions) count as complete.
 */
export function questionnaireSectionComplete(
  formCodes: string[],
  section: string,
  answers: Record<string, unknown>,
): boolean {
  const { filled, total } = countVisibleAnswers(formCodes, answers, section);
  return total === 0 || filled === total;
}

/**
 * Visible questionnaire questions that have an answer, plus the visible total.
 * Hidden/gated fields are excluded so the percent tracks what the person sees.
 */
export function questionnaireFillCounts(
  formCodes: string[],
  answers: Record<string, unknown>,
): { filled: number; total: number } {
  return countVisibleAnswers(formCodes, answers);
}

/**
 * Share of currently visible questionnaire questions that have an answer.
 * Hidden/gated fields are excluded so the percent tracks what the person sees.
 */
export function questionnaireFillPercent(
  formCodes: string[],
  answers: Record<string, unknown>,
): number {
  const { filled, total } = questionnaireFillCounts(formCodes, answers);
  if (total === 0) return 0;
  return Math.round((filled / total) * 100);
}
