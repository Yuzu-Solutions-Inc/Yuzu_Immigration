"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { createInvoiceStripeLinkAction } from "@/app/actions/finance-invoice-stripe";
import { Button } from "@/components/finance/Button";

export function InvoiceStripeLinkButton({
  invoiceId,
  disabled,
}: {
  invoiceId: string;
  disabled?: boolean;
}) {
  const t = useTranslations("financeApp.invoices");
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="secondary"
      disabled={disabled || pending}
      onClick={async () => {
        setPending(true);
        const result = await createInvoiceStripeLinkAction(invoiceId);
        setPending(false);
        if (result.url) {
          window.open(result.url, "_blank", "noopener,noreferrer");
          return;
        }
        alert(result.error === "stripe_not_configured" || result.error === "stripe_failed"
          ? t("stripeLinkFailed")
          : t("stripeLinkFailed"));
      }}
    >
      {pending ? t("stripeLinkPending") : t("stripeLink")}
    </Button>
  );
}
