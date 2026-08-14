"use client";

import { useActionState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createProjectPaymentAction,
  type ProjectPaymentActionState,
} from "@/app/actions/project-payment";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPriceCents } from "@/lib/booking/slots";

export type ProjectPaymentListItem = {
  id: string;
  status: string;
  amountCents: number;
  currency: string;
  description: string;
  checkoutUrl: string | null;
  paidAt: string | null;
  createdAt: string;
  token: string | null;
};

const initialState: ProjectPaymentActionState = {};

export function ProjectPaymentsCard({
  locale,
  projectId,
  canCreate,
  squareConnected,
  payments,
  people,
}: {
  locale: string;
  projectId: string;
  canCreate: boolean;
  squareConnected: boolean;
  payments: ProjectPaymentListItem[];
  people: { id: string; label: string }[];
}) {
  const t = useTranslations("projectPayments");
  const [state, action, pending] = useActionState(
    createProjectPaymentAction,
    initialState,
  );

  useEffect(() => {
    if (state.message === "created" && state.payUrl) {
      toast.success(t("created"));
      void navigator.clipboard.writeText(state.payUrl).catch(() => undefined);
    }
  }, [state.message, state.payUrl, t]);

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        invalid_amount: t("errors.invalidAmount"),
        unauthorized: t("errors.unauthorized"),
        forbidden: t("errors.forbidden"),
        not_found: t("errors.notFound"),
        square_not_connected: t("errors.squareNotConnected"),
        create_failed: t("errors.createFailed"),
      }[state.error] ?? t("errors.createFailed")
    : null;

  return (
    <SurfaceCard className="space-y-4 p-4 sm:p-5">
      <div>
        <h3 className="font-heading text-base font-semibold text-brand">
          {t("title")}
        </h3>
        <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
      </div>

      {!squareConnected ? (
        <p className="text-sm text-muted-foreground">{t("connectSquareFirst")}</p>
      ) : canCreate ? (
        <form action={action} className="space-y-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="projectId" value={projectId} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">{t("amount")}</Label>
              <Input
                id="payment-amount"
                name="amount"
                inputMode="decimal"
                placeholder="150.00"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-person">{t("person")}</Label>
              <select
                id="payment-person"
                name="personId"
                className="flex h-9 w-full rounded-lg border border-border bg-surface px-3 text-sm"
                defaultValue=""
              >
                <option value="">{t("personNone")}</option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="payment-description">{t("description")}</Label>
            <Input
              id="payment-description"
              name="description"
              placeholder={t("descriptionPlaceholder")}
              required
              maxLength={200}
            />
          </div>
          {errorMessage ? (
            <p className="text-sm text-destructive" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {state.payUrl ? (
            <p className="break-all rounded-lg bg-canvas px-3 py-2 text-xs text-muted-foreground">
              {t("linkCopied")} {state.payUrl}
            </p>
          ) : null}
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? t("creating") : t("create")}
          </Button>
        </form>
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("history")}
        </p>
        {payments.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("historyEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="rounded-xl border border-border bg-canvas px-3 py-2 text-sm"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-brand">{payment.description}</p>
                  <p className="text-brand">
                    {formatPriceCents(
                      payment.amountCents,
                      locale,
                      payment.currency,
                    )}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {payment.status === "paid"
                    ? t("statuses.paid")
                    : payment.status === "pending"
                      ? t("statuses.pending")
                      : payment.status === "failed"
                        ? t("statuses.failed")
                        : payment.status === "cancelled"
                          ? t("statuses.cancelled")
                          : payment.status === "expired"
                            ? t("statuses.expired")
                            : payment.status}
                  {" · "}
                  {new Date(payment.createdAt).toLocaleString(locale)}
                </p>
                {payment.status === "pending" && payment.token ? (
                  <p className="mt-1">
                    <a
                      href={`/${locale}/pay/${payment.token}`}
                      className="text-xs font-medium text-action hover:underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t("openLink")}
                    </a>
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SurfaceCard>
  );
}
