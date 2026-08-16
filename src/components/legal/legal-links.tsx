"use client";

import { PrivacyLink } from "@/components/legal/privacy-link";
import { TermsLink } from "@/components/legal/terms-link";
import { cn } from "@/lib/utils";

type LegalLinksProps = {
  className?: string;
  linkClassName?: string;
  onNavigate?: () => void;
};

/** Privacy and terms links for footers and chrome. */
export function LegalLinks({
  className,
  linkClassName,
  onNavigate,
}: LegalLinksProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      <PrivacyLink className={linkClassName} onNavigate={onNavigate} />
      <TermsLink className={linkClassName} onNavigate={onNavigate} />
    </div>
  );
}
