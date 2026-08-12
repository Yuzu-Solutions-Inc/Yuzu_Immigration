"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type PrivacyLinkProps = {
  className?: string;
  onNavigate?: () => void;
};

/** Low-key privacy policy link for footers and chrome. */
export function PrivacyLink({ className, onNavigate }: PrivacyLinkProps) {
  const t = useTranslations("legal");

  return (
    <Link
      href="/privacy"
      onClick={onNavigate}
      className={cn(
        "text-xs text-muted-foreground/80 underline-offset-2 transition-colors hover:text-muted-foreground hover:underline",
        className,
      )}
    >
      {t("privacyLink")}
    </Link>
  );
}
