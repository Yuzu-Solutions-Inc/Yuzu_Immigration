import {
  CalendarDays,
  CreditCard,
  FileCheck,
  FileStack,
  FolderKanban,
  Link2,
  LockKeyhole,
  MapPin,
  ScrollText,
  ShieldCheck,
  Users,
  UsersRound,
  Video,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { LegalLinks } from "@/components/legal/legal-links";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import {
  AppHomePreview,
  AppProjectPreview,
  BookingConfirmedPreview,
  ClientFillPreview,
  PublicBookingPreview,
  PublicPayPreview,
} from "@/components/marketing/product-previews";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const CAPABILITY_KEYS = [
  "projects",
  "people",
  "forms",
  "documents",
  "calendar",
  "meet",
  "square",
  "languages",
] as const;

const FEATURE_KEYS = [
  "projects",
  "people",
  "forms",
  "documents",
  "share",
  "booking",
  "payments",
  "team",
] as const;

const FEATURE_ICONS = {
  projects: FolderKanban,
  people: Users,
  forms: FileStack,
  documents: FileCheck,
  share: Link2,
  booking: CalendarDays,
  payments: CreditCard,
  team: UsersRound,
} as const;

const INTEGRATION_KEYS = ["calendar", "meet", "square"] as const;

const INTEGRATION_ICONS = {
  calendar: CalendarDays,
  meet: Video,
  square: CreditCard,
} as const;

const HOW_KEYS = ["one", "two", "three", "four"] as const;

const SECURITY_KEYS = ["canada", "encryption", "access", "privacy"] as const;

const SECURITY_ICONS = {
  canada: MapPin,
  encryption: LockKeyhole,
  access: ShieldCheck,
  privacy: ScrollText,
} as const;

export async function LandingPage() {
  const t = await getTranslations("home");

  return (
    <main className="landing-page relative flex min-h-full flex-1 flex-col overflow-x-hidden bg-canvas">
      <style>{`
        @keyframes landing-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landing-mesh {
          0%, 100% { transform: translate3d(0,0,0) scale(1); }
          50% { transform: translate3d(2%, -1%, 0) scale(1.04); }
        }
        @keyframes landing-preview-in {
          from { opacity: 0; transform: translateY(28px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .landing-page .lp-fade {
          animation: landing-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .landing-page .lp-delay-1 { animation-delay: 0.08s; }
        .landing-page .lp-delay-2 { animation-delay: 0.16s; }
        .landing-page .lp-delay-3 { animation-delay: 0.24s; }
        .landing-page .lp-delay-4 { animation-delay: 0.32s; }
        .landing-page .lp-mesh {
          animation: landing-mesh 18s ease-in-out infinite;
        }
        .landing-page .landing-preview {
          animation: landing-preview-in 0.9s cubic-bezier(0.22, 1, 0.36, 1) 0.28s both;
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-page .lp-fade,
          .landing-page .lp-mesh,
          .landing-page .landing-preview {
            animation: none !important;
          }
        }
      `}</style>

      <header className="relative z-20 border-b border-brand/5 bg-canvas/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <BrandLogo size="md" />
          <div className="flex items-center gap-2 sm:gap-3">
            <LocaleSwitcher compact className="hidden sm:inline-flex" />
            <Link
              href="/login"
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}
            >
              {t("navSignIn")}
            </Link>
            <Link
              href="/login?mode=signup"
              className={cn(buttonVariants({ size: "sm" }))}
            >
              {t("navCta")}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative isolate overflow-hidden bg-graphite-700 text-white">
        <div
          aria-hidden
          className="lp-mesh pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 80% 60% at 15% 20%, color-mix(in srgb, var(--indigo-500) 28%, transparent), transparent 55%), radial-gradient(ellipse 70% 50% at 85% 10%, color-mix(in srgb, var(--emerald-500) 18%, transparent), transparent 50%), radial-gradient(ellipse 60% 40% at 70% 80%, color-mix(in srgb, var(--amber-500) 14%, transparent), transparent 55%), linear-gradient(180deg, var(--graphite-700) 0%, var(--graphite-900) 55%, var(--graphite-700) 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at center, black 20%, transparent 75%)",
          }}
        />

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-6xl flex-col justify-between px-6 pt-14 sm:pt-20">
          <div className="max-w-3xl space-y-6 pb-12">
            <p className="lp-fade text-sm font-semibold tracking-[0.16em] text-white/55 uppercase">
              {t("audience")}
            </p>
            <div className="lp-fade lp-delay-1">
              <BrandLogo size="hero" href={null} inverted />
            </div>
            <h1 className="lp-fade lp-delay-2 font-heading max-w-2xl text-3xl font-bold tracking-tight text-pretty text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
              {t("title")}
            </h1>
            <p className="lp-fade lp-delay-3 max-w-xl text-base leading-relaxed text-pretty text-white/70 sm:text-lg">
              {t("subtitle")}
            </p>
            <div className="lp-fade lp-delay-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Link
                href="/login?mode=signup"
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-white text-brand hover:bg-white/95",
                )}
              >
                {t("cta")}
              </Link>
              <Link
                href="/login"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white",
                )}
              >
                {t("secondaryCta")}
              </Link>
            </div>
            <p className="lp-fade lp-delay-4 text-sm text-white/50">{t("ctaNote")}</p>
            <ul className="lp-fade lp-delay-4 flex flex-wrap gap-2 pt-1">
              {CAPABILITY_KEYS.map((key) => (
                <li
                  key={key}
                  className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-medium text-white/70"
                >
                  {t(`capabilities.${key}`)}
                </li>
              ))}
            </ul>
          </div>

          <div className="landing-preview relative mt-4 w-full">
            <div className="relative max-h-[min(36rem,52svh)] overflow-hidden">
              <AppHomePreview />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-gradient-to-t from-canvas to-transparent"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-b border-border bg-canvas py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl space-y-20 px-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold tracking-[0.14em] text-action uppercase">
              {t("showcases.eyebrow")}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("showcases.title")}
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty sm:text-base">
              {t("showcases.subtitle")}
            </p>
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
            <div className="pointer-events-none select-none">
              <AppProjectPreview />
            </div>
            <div className="space-y-3 lg:max-w-md">
              <h3 className="font-heading text-2xl font-semibold tracking-tight text-brand text-pretty">
                {t("showcases.file.title")}
              </h3>
              <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                {t("showcases.file.body")}
              </p>
            </div>
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
            <div className="space-y-3 lg:max-w-md lg:justify-self-end">
              <h3 className="font-heading text-2xl font-semibold tracking-tight text-brand text-pretty">
                {t("showcases.client.title")}
              </h3>
              <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                {t("showcases.client.body")}
              </p>
            </div>
            <div className="pointer-events-none order-first select-none lg:order-last">
              <ClientFillPreview />
            </div>
          </div>

          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:gap-12">
            <div className="pointer-events-none select-none">
              <PublicBookingPreview />
            </div>
            <div className="space-y-3 lg:max-w-md">
              <h3 className="font-heading text-2xl font-semibold tracking-tight text-brand text-pretty">
                {t("showcases.booking.title")}
              </h3>
              <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                {t("showcases.booking.body")}
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="max-w-2xl space-y-3">
              <h3 className="font-heading text-2xl font-semibold tracking-tight text-brand text-pretty">
                {t("showcases.after.title")}
              </h3>
              <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                {t("showcases.after.body")}
              </p>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="pointer-events-none select-none">
                <PublicPayPreview />
              </div>
              <div className="pointer-events-none select-none">
                <BookingConfirmedPreview />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold tracking-[0.14em] text-action uppercase">
              {t("integrations.eyebrow")}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("integrations.title")}
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty sm:text-base">
              {t("integrations.subtitle")}
            </p>
          </div>
          <ul className="mt-12 grid gap-10 sm:grid-cols-3">
            {INTEGRATION_KEYS.map((key) => {
              const Icon = INTEGRATION_ICONS[key];
              return (
                <li key={key} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Icon
                      className="size-5 text-action"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <h3 className="font-heading text-base font-semibold text-brand">
                      {t(`integrations.${key}.title`)}
                    </h3>
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                    {t(`integrations.${key}.body`)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="border-b border-border bg-canvas py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold tracking-[0.14em] text-action uppercase">
              {t("featuresEyebrow")}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("featuresTitle")}
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty sm:text-base">
              {t("featuresSubtitle")}
            </p>
          </div>

          <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {FEATURE_KEYS.map((key) => {
              const Icon = FEATURE_ICONS[key];
              return (
                <li key={key} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Icon
                      className="size-5 text-action"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <h3 className="font-heading text-base font-semibold text-brand">
                      {t(`features.${key}.title`)}
                    </h3>
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                    {t(`features.${key}.body`)}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold tracking-[0.14em] text-action uppercase">
              {t("howEyebrow")}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("howTitle")}
            </h2>
          </div>

          <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {HOW_KEYS.map((key, index) => (
              <li key={key} className="relative space-y-3">
                <span className="font-heading text-4xl font-bold tracking-tight text-brand/15">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-heading text-lg font-semibold text-brand">
                  {t(`how.${key}.title`)}
                </h3>
                <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                  {t(`how.${key}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b border-border bg-canvas py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl space-y-3">
            <p className="text-sm font-semibold tracking-[0.14em] text-action uppercase">
              {t("securityEyebrow")}
            </p>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("securityTitle")}
            </h2>
            <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty sm:text-base">
              {t("securitySubtitle")}
            </p>
          </div>

          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {SECURITY_KEYS.map((key) => {
              const Icon = SECURITY_ICONS[key];
              return (
                <div key={key} className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Icon
                      className="size-5 text-success"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <h3 className="font-heading text-base font-semibold text-brand">
                      {t(`security.${key}.title`)}
                    </h3>
                  </div>
                  <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                    {t(`security.${key}.body`)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-10">
            <Link
              href="/privacy"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {t("securityCta")}
            </Link>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-graphite-700 py-20 text-white sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 70% 80% at 50% 120%, color-mix(in srgb, var(--indigo-500) 35%, transparent), transparent 60%)",
          }}
        />
        <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-start gap-6 px-6 text-left sm:items-center sm:text-center">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-pretty sm:text-4xl">
            {t("finalTitle")}
          </h2>
          <p className="max-w-xl text-[15px] leading-relaxed text-white/65 text-pretty sm:text-base">
            {t("finalSubtitle")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/login?mode=signup"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-white text-brand hover:bg-white/95",
              )}
            >
              {t("finalCta")}
            </Link>
            <Link
              href="/login"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white",
              )}
            >
              {t("secondaryCta")}
            </Link>
          </div>
          <p className="text-sm text-white/45">{t("finalNote")}</p>
        </div>
      </section>

      <footer className="bg-graphite-900 py-8 text-white/50">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <BrandLogo size="sm" inverted />
            <p className="max-w-md text-xs leading-relaxed text-pretty">
              {t("footerTagline")}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <LocaleSwitcher
              compact
              className="[&_select]:border-white/15 [&_select]:bg-white/5 [&_select]:text-white/80"
            />
            <LegalLinks linkClassName="text-white/45 hover:text-white/70" />
          </div>
        </div>
      </footer>
    </main>
  );
}
