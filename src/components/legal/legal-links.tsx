"use client";

import { DocsLink } from "@/components/legal/docs-link";
import { HelpLink } from "@/components/legal/help-link";
import { PrivacyLink } from "@/components/legal/privacy-link";
import { TermsLink } from "@/components/legal/terms-link";
import { cn } from "@/lib/utils";

type LegalLinksProps = {
  className?: string;
  linkClassName?: string;
  onNavigate?: () => void;
};

/** Help, docs, privacy, and terms links for footers and chrome. */
export function LegalLinks({
  className,
  linkClassName,
  onNavigate,
}: LegalLinksProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <HelpLink className={linkClassName} onNavigate={onNavigate} />
      <DocsLink className={linkClassName} onNavigate={onNavigate} />
      <PrivacyLink className={linkClassName} onNavigate={onNavigate} />
      <TermsLink className={linkClassName} onNavigate={onNavigate} />
    </div>
  );
}
