"use client";

import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { copyBookingLinkAction } from "@/app/actions/booking";
import { Button } from "@/components/ui/button";

async function writeClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function CopyBookingLinkButton({ locale }: { locale: string }) {
  const t = useTranslations("calendar");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await copyBookingLinkAction(locale);
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
      }}
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : copied ? (
        <Check className="size-4" />
      ) : (
        <Copy className="size-4" />
      )}
      <Link2 className="sr-only" />
      {t("copyLink")}
    </Button>
  );
}
