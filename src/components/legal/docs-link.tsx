"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type DocsLinkProps = {
  className?: string;
  onNavigate?: () => void;
};

/** Low-key integration documentation link for footers and chrome. */
export function DocsLink({ className, onNavigate }: DocsLinkProps) {
  const t = useTranslations("docs");

  return (
    <Link
      href="/docs"
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
