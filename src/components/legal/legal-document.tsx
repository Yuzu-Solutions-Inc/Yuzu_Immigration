import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { Link } from "@/i18n/navigation";

export function LegalDocument({
  title,
  updated,
  intro,
  sections,
  backHomeLabel,
  appName,
  children,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: readonly { id: string; title: string; body: string }[];
  backHomeLabel: string;
  appName: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10 pb-16">
      <header className="space-y-4 border-b border-border pb-6">
        <BrandLogo size="sm" />
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{updated}</p>
          <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {intro}
          </p>
        </div>
      </header>

      <article className="space-y-8">
        {sections.map((section) => (
          <section key={section.id} className="space-y-2" id={section.id}>
            <h2 className="font-heading text-lg font-semibold text-brand">
              {section.title}
            </h2>
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground text-pretty">
              {section.body}
            </p>
          </section>
        ))}
      </article>

      {children}

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground">
        <p>{appName}</p>
        <div className="flex items-center gap-4">
          <Link href="/" className="hover:underline">
            {backHomeLabel}
          </Link>
          <LegalLinks />
        </div>
      </footer>
    </main>
  );
}
