"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";

import {
  destroyClosedProjectAction,
  exportPersonDataAction,
  type PrivacyActionState,
} from "@/app/actions/privacy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <p className="text-sm text-emerald-700">
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
          <div className="space-y-2">
            <Label htmlFor="confirmation">{t("destroyConfirmLabel")}</Label>
            <Input
              id="confirmation"
              name="confirmation"
              placeholder="DESTROY"
              autoComplete="off"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="note">{t("destroyNote")}</Label>
            <Input id="note" name="note" maxLength={500} />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {state.message === "destroyed" ? (
            <p className="text-sm text-emerald-700">{t("destroySuccess")}</p>
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
