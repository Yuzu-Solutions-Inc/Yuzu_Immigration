import { getTranslations } from "next-intl/server";

import { SurfaceCard } from "@/components/layout/surface-card";
import {
  formatImmCode,
  formDisplayTitle,
  groupedFormVersionRows,
  loadFormValidationStatus,
  type FormVersionRow,
} from "@/lib/ircc/form-directory";
import { cn } from "@/lib/utils";

function formatMonth(value: string | null, locale: string): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatCheckedAt(value: string | null, locale: string): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function ValidationBadge({
  status,
  passedLabel,
  failedLabel,
  pendingLabel,
}: {
  status: FormVersionRow["validation"];
  passedLabel: string;
  failedLabel: string;
  pendingLabel: string;
}) {
  const label =
    status === "passed"
      ? passedLabel
      : status === "failed"
        ? failedLabel
        : pendingLabel;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        status === "passed" && "bg-success-bg text-success-text",
        status === "failed" && "bg-red-50 text-red-800",
        status === "pending" && "bg-canvas text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

export async function FormVersionsPanel({
  locale,
}: {
  locale: "en" | "fr" | "es";
}) {
  const t = await getTranslations("settings");
  const tp = await getTranslations("programs");
  const status = loadFormValidationStatus();
  const groups = groupedFormVersionRows();
  const intlLocale = locale === "fr" ? "fr-CA" : locale === "es" ? "es" : "en-CA";

  return (
    <SurfaceCard className="space-y-6 sm:p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("forms")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("formsHelp")}</p>
        <p className="mt-2 text-sm text-brand">
          {status?.checkedAt
            ? t("formsLastCheck", {
                date: formatCheckedAt(status.checkedAt, intlLocale),
                result: status.passed ? t("formsPassed") : t("formsFailed"),
              })
            : t("formsNeverChecked")}
        </p>
      </div>

      {groups.map((group) => (
        <section key={group.category} className="space-y-2">
          <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
            {t(`formCat.${group.category}`)}
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {group.forms.map((row) => (
              <li key={row.code} className="space-y-2 bg-surface px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-brand">
                      {formatImmCode(row.code)}
                      <span className="ml-2 font-normal text-muted-foreground">
                        {formDisplayTitle(row.code, locale)}
                      </span>
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {row.visaFamilies.map((family) => (
                        <span
                          key={family}
                          className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {tp(family)}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ValidationBadge
                    status={row.validation}
                    passedLabel={t("formsPassed")}
                    failedLabel={t("formsFailed")}
                    pendingLabel={t("formsPending")}
                  />
                </div>
                <dl className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-brand/70">
                      {t("formsPdfVersion")}
                    </dt>
                    <dd>{row.published ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-brand/70">
                      {t("formsPublished")}
                    </dt>
                    <dd>{formatMonth(row.published, intlLocale)}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-brand/70">
                      {t("formsValidated")}
                    </dt>
                    <dd>{formatCheckedAt(row.lastCheckedAt, intlLocale)}</dd>
                  </div>
                </dl>
                {row.livePublished &&
                row.published &&
                row.livePublished !== row.published ? (
                  <p className="text-xs text-red-800">
                    {t("formsIrccNewer", { date: row.livePublished })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </SurfaceCard>
  );
}
