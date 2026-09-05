import type { ReactNode } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { Link } from "@/i18n/navigation";

export function PublicInfoPage({
  title,
  intro,
  backHomeLabel,
  appName,
  children,
}: {
  title: string;
  intro: string;
  backHomeLabel: string;
  appName: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10 pb-16">
      <header className="space-y-4 border-b border-border pb-6">
        <BrandLogo size="sm" />
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight text-brand">
            {title}
          </h1>
          <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
            {intro}
          </p>
        </div>
      </header>

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

export function PublicInfoSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="space-y-3 scroll-mt-6">
      <h2 className="font-heading text-lg font-semibold text-brand">{title}</h2>
      {children}
    </section>
  );
}

export function PublicInfoBody({ children }: { children: ReactNode }) {
  return (
    <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground text-pretty">
      {children}
    </p>
  );
}

export function PublicInfoList({ items }: { items: readonly string[] }) {
  return (
    <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-relaxed text-muted-foreground text-pretty">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ol>
  );
}
