"use client";

import { Check, Link2, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { copyServiceLinkAction } from "@/app/actions/services";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  hasUrgentPricing,
  type BookingRateKind,
} from "@/lib/booking/pricing";
import { formatPriceCents } from "@/lib/booking/slots";
import type { BookingServiceRow } from "@/lib/booking/types";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyServiceLinkButton({
  locale,
  service,
}: {
  locale: string;
  service: BookingServiceRow;
}) {
  const t = useTranslations("services");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const urgent = hasUrgentPricing(service);

  function copy(rateKind: BookingRateKind) {
    startTransition(async () => {
      const result = await copyServiceLinkAction({
        locale,
        serviceId: service.id,
        rateKind,
      });
      if (!result.bookingUrl) {
        toast.error(t(`errors.${result.error ?? "generic"}`));
        return;
      }
      const ok = await writeClipboard(result.bookingUrl);
      if (ok) {
        setCopied(true);
        toast.success(t("linkCopied"));
        window.setTimeout(() => setCopied(false), 2000);
      } else {
        toast.message(result.bookingUrl);
      }
    });
  }

  const icon = pending ? (
    <Loader2 className="size-4 animate-spin" />
  ) : copied ? (
    <Check className="size-4" />
  ) : (
    <Link2 className="size-4" />
  );

  if (!urgent) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        disabled={pending}
        onClick={() => copy("standard")}
        aria-label={t("copyLink")}
        title={t("copyLink")}
      >
        {icon}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
        aria-label={t("copyLink")}
        title={t("copyLink")}
      >
        {icon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem onClick={() => copy("standard")}>
          {t("copyStandardLink")}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatPriceCents(service.price_cents, locale, service.currency)}
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => copy("urgent")}>
          {t("copyUrgentLink")}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatPriceCents(
              service.urgent_price_cents ?? 0,
              locale,
              service.currency,
            )}
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
