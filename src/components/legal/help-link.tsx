"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type HelpLinkProps = {
  className?: string;
  onNavigate?: () => void;
};

/** Low-key help and support link for footers and chrome. */
export function HelpLink({ className, onNavigate }: HelpLinkProps) {
  const t = useTranslations("help");

  return (
    <Link
      href="/help"
      onClick={onNavigate}
      className={cn(
        "text-xs text-muted-foreground/80 underline-offset-2 transition-colors hover:text-muted-foreground hover:underline",
        className,
      )}
    >
      {t("link")}
    </Link>
  );
}
