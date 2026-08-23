"use client";

import { useActionState, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import {
  deleteOrganizationAction,
  type DeleteOrganizationState,
} from "@/app/actions/org";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldError, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { product } from "@/lib/brand/product";
import type { AppLocale } from "@/lib/i18n/locales";

const empty: DeleteOrganizationState = {};

function ConfirmCheck({
  id,
  name,
  checked,
  onChange,
  children,
}: {
  id: string;
  name: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 text-sm leading-relaxed">
      <input
        id={id}
        name={name}
        type="checkbox"
        value="yes"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-4 shrink-0 rounded border-input"
      />
      <span>{children}</span>
    </label>
  );
}

export function DeleteOrganizationPanel({
  locale,
  organizationName,
}: {
  locale: AppLocale;
  organizationName: string;
}) {
  const t = useTranslations("settings");
  const [open, setOpen] = useState(false);
  const [ciccBackup, setCiccBackup] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [confirmName, setConfirmName] = useState("");
  const [state, action, pending] = useActionState(
    deleteOrganizationAction,
    empty,
  );

  const supportHref = `mailto:${product.supportEmail}?subject=${encodeURIComponent(
    t("deleteOrgMailSubject", { name: organizationName }),
  )}`;

  const ready =
    ciccBackup &&
    understood &&
    finalConfirm &&
    confirmName.trim().toLowerCase() === organizationName.trim().toLowerCase();

  const error =
    state.error &&
    ({
      confirmations_required: t("errors.deleteConfirmations"),
      name_mismatch: t("errors.deleteNameMismatch"),
      forbidden: t("errors.forbidden"),
      delete_failed: t("errors.deleteFailed"),
    }[state.error] ??
      t("errors.generic"));

  return (
    <section className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("deleteOrgTitle")}
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t("deleteOrgHelp")}
        </p>
      </div>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
        {t("deleteOrgOpen")}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setCiccBackup(false);
            setUnderstood(false);
            setFinalConfirm(false);
            setConfirmName("");
          }
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          showCloseButton={!pending}
        >
          <DialogHeader>
            <DialogTitle>{t("deleteOrgDialogTitle")}</DialogTitle>
            <DialogDescription>{t("deleteOrgDialogBody")}</DialogDescription>
          </DialogHeader>

          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("deleteOrgBulletClients")}</li>
            <li>{t("deleteOrgBulletFiles")}</li>
            <li>{t("deleteOrgBulletKept")}</li>
          </ul>

          <p className="text-sm">
            <a
              href={supportHref}
              className="font-medium text-action underline-offset-2 hover:underline"
            >
              {t("deleteOrgContact", { email: product.supportEmail })}
            </a>
          </p>

          <form action={action} className="space-y-4">
            <input type="hidden" name="locale" value={locale} />
            {ciccBackup ? <input type="hidden" name="ciccBackup" value="yes" /> : null}
            {understood ? <input type="hidden" name="understood" value="yes" /> : null}
            {finalConfirm ? (
              <input type="hidden" name="finalConfirm" value="yes" />
            ) : null}

            <div className="space-y-3 rounded-xl border border-border bg-canvas p-3">
              <ConfirmCheck
                id="ciccBackup"
                name="ciccBackupUi"
                checked={ciccBackup}
                onChange={setCiccBackup}
              >
                {t("deleteOrgCicc")}
              </ConfirmCheck>
              <ConfirmCheck
                id="understood"
                name="understoodUi"
                checked={understood}
                onChange={setUnderstood}
              >
                {t("deleteOrgIrreversible")}
              </ConfirmCheck>
              <ConfirmCheck
                id="finalConfirm"
                name="finalConfirmUi"
                checked={finalConfirm}
                onChange={setFinalConfirm}
              >
                {t("deleteOrgFinal")}
              </ConfirmCheck>
            </div>

            <Field>
              <FieldLabel htmlFor="confirmName" required>
                {t("deleteOrgTypeName")}
              </FieldLabel>
              <Input
                id="confirmName"
                name="confirmName"
                value={confirmName}
                onChange={(event) => setConfirmName(event.target.value)}
                autoComplete="off"
              />
              <FieldHint>{t("deleteOrgTypeNameHelp", { name: organizationName })}</FieldHint>
            </Field>

            {error ? <FieldError>{error}</FieldError> : null}

            <DialogFooter className="px-0 pb-0">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                {t("deleteOrgCancel")}
              </Button>
              <Button type="submit" variant="destructive" disabled={pending || !ready}>
                {pending ? t("deleteOrgDeleting") : t("deleteOrgSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
