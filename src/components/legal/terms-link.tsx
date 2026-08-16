"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type TermsLinkProps = {
  className?: string;
  onNavigate?: () => void;
};

/** Low-key terms and conditions link for footers and chrome. */
export function TermsLink({ className, onNavigate }: TermsLinkProps) {
  const t = useTranslations("legal");

  return (
    <Link
      href="/terms"
      onClick={onNavigate}
      className={cn(
        "text-xs text-muted-foreground/80 underline-offset-2 transition-colors hover:text-muted-foreground hover:underline",
        className,
      )}
    >
      {t("termsLink")}
    </Link>
  );
}
