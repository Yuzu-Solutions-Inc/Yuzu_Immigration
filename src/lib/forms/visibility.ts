export type ShowWhen = {
  key: string;
  equals?: string;
  oneOf?: string[];
  notEquals?: string;
};

export type ShowWhenRule = ShowWhen | ShowWhen[] | { or: ShowWhen[] };

export function matchesShowWhen(
  rule: ShowWhenRule | undefined,
  answers: Record<string, unknown>,
): boolean {
  if (!rule) return true;
  if ("or" in rule && Array.isArray(rule.or)) {
    return rule.or.some((r) => matchesShowWhen(r, answers));
  }
  const rules = Array.isArray(rule) ? rule : [rule as ShowWhen];
  return rules.every((r) => {
    const raw = answers[r.key];
    const value = raw === undefined || raw === null ? "" : String(raw);
    if (r.equals !== undefined) return value === r.equals;
    if (r.notEquals !== undefined) return value !== r.notEquals;
    if (r.oneOf) return r.oneOf.includes(value);
    return true;
  });
}

export function showWhenClauses(rule?: ShowWhenRule): ShowWhen[] {
  if (!rule) return [];
  if (Array.isArray(rule)) return rule;
  if ("or" in rule) return rule.or;
  return [rule];
}

/** Most specific gate: last AND clause, or first OR clause. */
export function primaryGateKey(rule?: ShowWhenRule): string | undefined {
  const clauses = showWhenClauses(rule);
  if (clauses.length === 0) return undefined;
  if (rule && "or" in rule && Array.isArray(rule.or)) return clauses[0]?.key;
  return clauses[clauses.length - 1]?.key;
}

export function isGatedByParent(
  rule: ShowWhenRule | undefined,
  parentKey: string,
  answers: Record<string, unknown>,
): boolean {
  if (!rule) return false;
  if ("or" in rule && Array.isArray(rule.or)) {
    return rule.or.some(
      (clause) => clause.key === parentKey && matchesShowWhen(clause, answers),
    );
  }
  return primaryGateKey(rule) === parentKey;
}
