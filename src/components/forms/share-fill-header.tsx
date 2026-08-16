import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export type ShareFillSection = "home" | "forms" | "documents";

export async function ShareFillHeader({
  token,
  projectTitle,
  expiresLabel,
  active,
}: {
  token: string;
  projectTitle: string;
  expiresLabel: string;
  active: ShareFillSection;
}) {
  const td = await getTranslations("documents");
  const tf = await getTranslations("forms");

  const tabs = [
    {
      id: "documents" as const,
      href: `/fill/${token}/documents`,
      label: td("landingDocumentsTitle"),
    },
    {
      id: "forms" as const,
      href: `/fill/${token}/forms`,
      label: td("landingFormsTitle"),
    },
  ];

  return (
    <header className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {td("clientEyebrow")}
        </p>
        <Link href={`/fill/${token}`} className="group block">
          <h1 className="font-heading text-2xl font-semibold text-brand transition-colors group-hover:text-action sm:text-3xl">
            {projectTitle}
          </h1>
        </Link>
        <p className="text-sm text-muted-foreground">
          {tf("clientExpires", { date: expiresLabel })}
        </p>
      </div>

      <nav
        aria-label={td("shareNavLabel")}
        className="flex gap-1 border-b border-border"
      >
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "border-action text-brand"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-brand",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
