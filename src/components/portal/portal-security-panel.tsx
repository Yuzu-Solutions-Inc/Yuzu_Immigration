"use client";

import { Download } from "lucide-react";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";

import {
  requestPortalDeletionAction,
  type PortalDeletionState,
} from "@/app/actions/portal-privacy";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  FieldSuccess,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { AppLocale } from "@/lib/i18n/locales";
import { CLOSED_FILE_RETENTION_YEARS } from "@/lib/privacy/retention";

const initial: PortalDeletionState = {};

export function PortalSecurityPanel({ locale }: { locale: AppLocale }) {
  const t = useTranslations("portal.security");
  const years = CLOSED_FILE_RETENTION_YEARS;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [state, action, pending] = useActionState(
    requestPortalDeletionAction,
    initial,
  );

  const deletionError =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      unauthorized: t("errors.unauthorized"),
      already_requested: t("errors.alreadyRequested"),
      no_firm_contact: t("errors.noFirmContact"),
      not_found: t("errors.notFound"),
      email_not_configured: t("errors.emailNotConfigured"),
      send_failed: t("errors.sendFailed"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <div className="space-y-8">
      <section className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-elevated">
        <div className="space-y-1">
          <h2 className="font-heading text-base font-semibold text-brand">
            {t("downloadTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {t("downloadHelp")}
          </p>
        </div>
        {downloadError ? <FieldError>{downloadError}</FieldError> : null}
        <Button
          type="button"
          variant="outline"
          disabled={downloading}
          onClick={async () => {
            setDownloadError(null);
            setDownloading(true);
            try {
              const response = await fetch(`/${locale}/portal/security/export`);
              if (!response.ok) {
                setDownloadError(t("errors.exportFailed"));
                return;
              }
              const blob = await response.blob();
              const header = response.headers.get("Content-Disposition") ?? "";
              const match = /filename="([^"]+)"/.exec(header);
              const filename = match?.[1] ?? "yuzu-portal-export.zip";
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = filename;
              a.click();
              URL.revokeObjectURL(url);
            } catch {
              setDownloadError(t("errors.exportFailed"));
            } finally {
              setDownloading(false);
            }
          }}
        >
          <Download />
          {downloading ? t("downloading") : t("downloadCta")}
        </Button>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5 shadow-elevated">
        <div className="space-y-1">
          <h2 className="font-heading text-base font-semibold text-brand">
            {t("deleteTitle")}
          </h2>
          <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
            {t("deleteHelp", { years })}
          </p>
        </div>
        <form action={action} className="space-y-4">
          <input type="hidden" name="locale" value={locale} />
          <Field>
            <FieldLabel htmlFor="deletion-note">{t("noteLabel")}</FieldLabel>
            <Textarea
              id="deletion-note"
              name="note"
              maxLength={500}
              rows={3}
              disabled={pending || state.success}
            />
            <FieldHint>{t("noteHint")}</FieldHint>
          </Field>
          {deletionError ? <FieldError>{deletionError}</FieldError> : null}
          {state.success ? <FieldSuccess>{t("deleteSent")}</FieldSuccess> : null}
          <Button type="submit" disabled={pending || state.success}>
            {pending ? t("deleteSending") : t("deleteCta")}
          </Button>
        </form>
      </section>
    </div>
  );
}
