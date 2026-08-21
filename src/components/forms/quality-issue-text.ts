import type { useTranslations } from "next-intl";

import type { QualityIssue } from "@/lib/ircc/data-quality";

export function qualityIssueText(
  issue: QualityIssue,
  t: ReturnType<typeof useTranslations<"forms">>,
): string {
  const params: Record<string, string | number> = { ...issue.params };
  if (typeof params.table === "string") {
    params.table = t(`tables.${params.table}.title`);
  }
  if (typeof params.item === "string") {
    params.item = t(`quality.items.${params.item}`);
  }
  if (typeof params.field === "string") {
    params.field = t(`fields.${params.field}`);
  }
  return t(`quality.issues.${issue.id}`, params);
}

export function qualityIssueKey(issue: QualityIssue, prefix = ""): string {
  return [
    prefix,
    issue.id,
    issue.section,
    issue.params?.row ?? "",
    issue.params?.rowA ?? "",
    issue.params?.field ?? "",
    issue.params?.item ?? "",
    issue.params?.table ?? "",
    issue.params?.parent ?? "",
  ].join("-");
}
