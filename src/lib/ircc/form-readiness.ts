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
