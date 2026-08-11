/** Project / IRCC form language. IRCC blanks are English or French only. */
export type ProjectFormLanguage = "en" | "fr";

/** IRCC blank suffix / questionnaire answer codes. */
export type IrccFormLanguage = "e" | "f";

export function isProjectFormLanguage(value: unknown): value is ProjectFormLanguage {
  return value === "en" || value === "fr";
}

export function toIrccFormLanguage(value: unknown): IrccFormLanguage {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  return raw === "fr" || raw === "f" || raw.startsWith("french") ? "f" : "e";
}

export function toProjectFormLanguage(value: unknown): ProjectFormLanguage {
  return toIrccFormLanguage(value) === "f" ? "fr" : "en";
}

/** Inject project form language into questionnaire answers (IRCC `e`/`f`). */
export function withProjectFormLanguage(
  answers: Record<string, unknown>,
  formLanguage: unknown,
): Record<string, unknown> {
  return {
    ...answers,
    formLanguage: toIrccFormLanguage(formLanguage),
  };
}
