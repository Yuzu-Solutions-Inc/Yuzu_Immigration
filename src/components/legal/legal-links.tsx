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
  /** Help and docs live in the app support menu; omit them from the sidebar. */
  includeHelpAndDocs?: boolean;
};

/** Help, docs, privacy, and terms links for footers and chrome. */
export function LegalLinks({
  className,
  linkClassName,
  onNavigate,
  includeHelpAndDocs = true,
}: LegalLinksProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
      {includeHelpAndDocs ? (
        <>
          <HelpLink className={linkClassName} onNavigate={onNavigate} />
          <DocsLink className={linkClassName} onNavigate={onNavigate} />
        </>
      ) : null}
      <PrivacyLink className={linkClassName} onNavigate={onNavigate} />
      <TermsLink className={linkClassName} onNavigate={onNavigate} />
    </div>
  );
}
