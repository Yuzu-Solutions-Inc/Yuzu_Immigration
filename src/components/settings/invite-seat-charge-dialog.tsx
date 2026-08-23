"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { BillingInterval } from "@/lib/billing/plans";
import type { AppLocale } from "@/lib/i18n/locales";
import {
  annualTotal,
  formatCadMonthly,
  formatCadYearly,
} from "@/lib/marketing/pricing";

export function InviteSeatChargeDialog({
  locale,
  open,
  onOpenChange,
  monthlyCad,
  seats,
  interval,
  pending,
  onConfirm,
}: {
  locale: AppLocale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  monthlyCad: number;
  seats: number;
  interval: BillingInterval;
  pending: boolean;
  onConfirm: () => void;
}) {
  const t = useTranslations("settings");
  const yearly = interval === "year";
  const price = yearly
    ? formatCadYearly(annualTotal(monthlyCad), locale)
    : formatCadMonthly(monthlyCad, locale);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("inviteChargeTitle")}</DialogTitle>
          <DialogDescription>
            {t("inviteChargeBody", { price, seats })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {t("inviteChargeCancel")}
          </Button>
          <Button type="button" onClick={onConfirm} disabled={pending}>
            {pending ? t("inviteSending") : t("inviteChargeConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
