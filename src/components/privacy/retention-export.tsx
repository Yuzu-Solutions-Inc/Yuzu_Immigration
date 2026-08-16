"use client";

import { useActionState, useState } from "react";
import { Download } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  destroyClosedProjectAction,
  exportPersonDataAction,
  type PrivacyActionState,
} from "@/app/actions/privacy";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldLabel,
  FieldSuccess,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AppLocale } from "@/lib/i18n/locales";
import { isEligibleForDestruction } from "@/lib/privacy/retention";

const initial: PrivacyActionState = {};

export function ProjectRetentionPanel({
  locale,
  projectId,
  closedAt,
  retainUntil,
  destroyedAt,
  canAdminister,
}: {
  locale: AppLocale;
  projectId: string;
  closedAt: string | null;
  retainUntil: string | null;
  destroyedAt: string | null;
  canAdminister: boolean;
}) {
  const t = useTranslations("privacy");
  const [state, action, pending] = useActionState(
    destroyClosedProjectAction,
    initial,
  );

  const eligible = isEligibleForDestruction({
    closedAt,
    retainUntil,
    destroyedAt,
  });

  if (!closedAt && !destroyedAt) {
    return null;
  }

  const error =
    state.error &&
    ({
      invalid: t("errors.invalid"),
      unauthorized: t("errors.unauthorized"),
      forbidden: t("errors.forbidden"),
      not_found: t("errors.notFound"),
      not_eligible: t("errors.notEligible"),
      destroy_failed: t("errors.destroyFailed"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-elevated">
      <div>
        <h2 className="font-heading text-base font-semibold text-brand">
          {t("retentionTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("retentionHelp")}</p>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("closedAt")}
          </dt>
          <dd className="text-brand">
            {closedAt ? new Date(closedAt).toLocaleDateString(locale) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs tracking-wide text-muted-foreground uppercase">
            {t("retainUntil")}
          </dt>
          <dd className="text-brand">
            {retainUntil
              ? new Date(retainUntil).toLocaleDateString(locale)
              : "—"}
          </dd>
        </div>
      </dl>

      {destroyedAt ? (
        <p className="text-sm text-success">
          {t("destroyedOn", {
            date: new Date(destroyedAt).toLocaleString(locale),
          })}
        </p>
      ) : null}

      {canAdminister && eligible ? (
        <form action={action} className="space-y-3 border-t border-border pt-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="projectId" value={projectId} />
          <p className="text-sm text-muted-foreground">{t("destroyHelp")}</p>
          <Field>
            <FieldLabel htmlFor="confirmation" required>
              {t("destroyConfirmLabel")}
            </FieldLabel>
            <Input
              id="confirmation"
              name="confirmation"
              placeholder="DESTROY"
              autoComplete="off"
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="note">{t("destroyNote")}</FieldLabel>
            <Input id="note" name="note" maxLength={500} />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
          {state.message === "destroyed" ? (
            <FieldSuccess>{t("destroySuccess")}</FieldSuccess>
          ) : null}
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? t("destroying") : t("destroy")}
          </Button>
        </form>
      ) : null}

      {canAdminister && !eligible && !destroyedAt ? (
        <p className="text-xs text-muted-foreground">{t("destroyNotYet")}</p>
      ) : null}
    </section>
  );
}

export function ExportProjectFileButton({
  locale,
  projectId,
}: {
  locale: string;
  projectId: string;
}) {
  const t = useTranslations("privacy");
  const [pending, setPending] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      title={t("downloadFileHelp")}
      onClick={async () => {
        setPending(true);
        try {
          const response = await fetch(
            `/${locale}/projects/${projectId}/file-export`,
          );
          if (!response.ok) {
            let code = "generic";
            try {
              const body = (await response.json()) as { error?: string };
              code = body.error ?? code;
            } catch {
              /* ignore */
            }
            const message =
              ({
                unauthorized: t("errors.unauthorized"),
                forbidden: t("errors.forbidden"),
                not_found: t("errors.notFound"),
                export_failed: t("errors.exportFailed"),
              }[code] ?? t("errors.generic"));
            window.alert(message);
            return;
          }
          const blob = await response.blob();
          const header = response.headers.get("Content-Disposition") ?? "";
          const match = /filename="([^"]+)"/.exec(header);
          const filename = match?.[1] ?? `file-export-${projectId.slice(0, 8)}.zip`;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = filename;
          a.click();
          URL.revokeObjectURL(url);
        } catch {
          window.alert(t("errors.exportFailed"));
        } finally {
          setPending(false);
        }
      }}
    >
      <Download />
      {pending ? t("downloadingFile") : t("downloadFile")}
    </Button>
  );
}

export function ExportPersonButton({ personId }: { personId: string }) {
  const t = useTranslations("privacy");

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        const result = await exportPersonDataAction(personId);
        if (!result.exportBase64 || !result.exportFilename) {
          const message =
            ({
              invalid: t("errors.invalid"),
              unauthorized: t("errors.unauthorized"),
              forbidden: t("errors.forbidden"),
              not_found: t("errors.notFound"),
            }[result.error ?? ""] ?? t("errors.generic"));
          window.alert(message);
          return;
        }
        const binary = atob(result.exportBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.exportFilename;
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      {t("exportPerson")}
    </Button>
  );
}
