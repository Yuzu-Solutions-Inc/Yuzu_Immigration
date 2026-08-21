import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

type MarketingNavCopy = {
  pricing: string;
  signIn: string;
  cta: string;
  footerTagline: string;
};

export function MarketingHeader({
  copy,
  active,
}: {
  copy: MarketingNavCopy;
  active?: "home" | "pricing";
}) {
  return (
    <header className="relative z-20 border-b border-brand/5 bg-canvas/80 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <div className="flex min-w-0 items-center gap-5">
          <BrandLogo size="md" />
          <Link
            href="/pricing"
            className={cn(
              "hidden text-sm font-medium transition-colors sm:inline",
              active === "pricing"
                ? "text-brand"
                : "text-muted-foreground hover:text-brand",
            )}
            aria-current={active === "pricing" ? "page" : undefined}
          >
            {copy.pricing}
          </Link>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/pricing"
            className={cn(
              "text-sm font-medium sm:hidden",
              active === "pricing"
                ? "text-brand"
                : "text-muted-foreground hover:text-brand",
            )}
            aria-current={active === "pricing" ? "page" : undefined}
          >
            {copy.pricing}
          </Link>
          <LocaleSwitcher compact className="hidden sm:inline-flex" />
          <Link
            href="/login"
            className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
          >
            {copy.signIn}
          </Link>
          <Link
            href="/login?mode=signup"
            className={cn(buttonVariants({ size: "sm" }))}
          >
            {copy.cta}
          </Link>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter({ copy }: { copy: MarketingNavCopy }) {
  return (
    <footer className="border-t border-white/10 bg-graphite-900 py-8 text-white/50">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <BrandLogo size="sm" inverted />
          <p className="max-w-md text-xs leading-relaxed text-pretty">
            {copy.footerTagline}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <LocaleSwitcher
            compact
            className="[&_select]:border-white/15 [&_select]:bg-white/5 [&_select]:text-white/80"
          />
          <Link
            href="/pricing"
            className="text-xs text-white/45 hover:text-white/70"
          >
            {copy.pricing}
          </Link>
          <LegalLinks linkClassName="text-white/45 hover:text-white/70" />
        </div>
      </div>
    </footer>
  );
}

export function MarketingFinalCta({
  title,
  subtitle,
  cta,
  secondaryCta,
  note,
}: {
  title: string;
  subtitle: string;
  cta: string;
  secondaryCta: string;
  note: string;
}) {
  return (
    <section className="relative overflow-hidden bg-graphite-900 py-20 text-white sm:py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 90% 45% at 50% -10%, color-mix(in srgb, var(--indigo-500) 18%, transparent), transparent 58%)",
        }}
      />
      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-6 text-left sm:items-center sm:text-center">
        <h2 className="font-heading text-3xl font-bold tracking-tight text-pretty text-white sm:text-4xl">
          {title}
        </h2>
        <p className="max-w-xl text-[15px] leading-relaxed text-pretty text-white/90 sm:text-base">
          {subtitle}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href="/login?mode=signup"
            className={cn(
              buttonVariants({ size: "lg" }),
              "bg-white text-brand hover:bg-white/95",
            )}
          >
            {cta}
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "outline", size: "lg" }),
              "border-white/45 bg-transparent text-white hover:bg-white/10 hover:text-white",
            )}
          >
            {secondaryCta}
          </Link>
        </div>
        <p className="text-sm text-white/75">{note}</p>
      </div>
    </section>
  );
}
