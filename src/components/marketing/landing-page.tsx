import "./landing.css";

import {
  CalendarDays,
  CreditCard,
  FileCheck,
  FilePen,
  FileStack,
  FolderKanban,
  Link2,
  LockKeyhole,
  MapPin,
  Receipt,
  ScrollText,
  ShieldCheck,
  Users,
  UsersRound,
  Workflow,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ComponentType } from "react";

import { BrandLogo } from "@/components/brand/brand-logo";
import { GoogleCalendarLogo } from "@/components/brand/google-calendar-logo";
import { GoogleMeetLogo } from "@/components/brand/google-meet-logo";
import { MicrosoftTeamsLogo } from "@/components/brand/microsoft-teams-logo";
import { OutlookCalendarLogo } from "@/components/brand/outlook-calendar-logo";
import { SageLogo } from "@/components/brand/sage-logo";
import { SquareLogo } from "@/components/brand/square-logo";
import { ZoomLogo } from "@/components/brand/zoom-logo";
import {
  MarketingFinalCta,
  MarketingFooter,
  MarketingHeader,
  MarketingTestingBanner,
} from "@/components/marketing/marketing-chrome";
import { HeroAtmosphere } from "@/components/marketing/hero-atmosphere";
import { HeroProductStage } from "@/components/marketing/hero-product-stage";
import { PricingPlanCards } from "@/components/marketing/pricing-plans";
import {
  AppHomePreview,
  AppProjectPreview,
  ClientPortalPreview,
  PublicBookingPreview,
} from "@/components/marketing/product-previews";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const CAPABILITY_KEYS = [
  "projects",
  "people",
  "forms",
  "documents",
  "contracts",
  "booking",
  "calendar",
  "meet",
  "square",
  "sage",
  "languages",
] as const;

const FEATURE_KEYS = [
  "projects",
  "people",
  "forms",
  "documents",
  "contracts",
  "share",
  "booking",
  "payments",
  "sage",
  "team",
] as const;

const FEATURE_ICONS = {
  projects: FolderKanban,
  people: Users,
  forms: FileStack,
  documents: FileCheck,
  contracts: FilePen,
  share: Link2,
  booking: CalendarDays,
  payments: CreditCard,
  sage: Receipt,
  team: UsersRound,
} as const;

const FEATURE_TONES = {
  projects: "indigo",
  people: "emerald",
  forms: "amber",
  documents: "indigo",
  contracts: "emerald",
  share: "amber",
  booking: "indigo",
  payments: "emerald",
  sage: "amber",
  team: "indigo",
} as const;

const FEATURE_BETA = new Set<(typeof FEATURE_KEYS)[number]>(["sage"]);

type BuiltinItem = {
  key: "booking" | "contracts";
  Icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

const BUILTIN_ITEMS: readonly BuiltinItem[] = [
  { key: "booking", Icon: CalendarDays },
  { key: "contracts", Icon: FilePen },
];

type IntegrationItem = {
  key: "calendar" | "outlook" | "meet" | "teams" | "zoom" | "square" | "sage";
  Logo: ComponentType<{ className?: string; title?: string }>;
  beta: boolean;
};

const INTEGRATION_GROUPS: readonly {
  key: "calendar" | "meetings" | "payment";
  items: readonly IntegrationItem[];
}[] = [
  {
    key: "calendar",
    items: [
      { key: "calendar", Logo: GoogleCalendarLogo, beta: false },
      { key: "outlook", Logo: OutlookCalendarLogo, beta: true },
    ],
  },
  {
    key: "meetings",
    items: [
      { key: "meet", Logo: GoogleMeetLogo, beta: false },
      { key: "teams", Logo: MicrosoftTeamsLogo, beta: true },
      { key: "zoom", Logo: ZoomLogo, beta: true },
    ],
  },
  {
    key: "payment",
    items: [
      { key: "square", Logo: SquareLogo, beta: false },
      { key: "sage", Logo: SageLogo, beta: true },
    ],
  },
];

const INTEGRATION_MARQUEE: IntegrationItem[] = INTEGRATION_GROUPS.flatMap(
  (group) => [...group.items],
);

const HOW_KEYS = ["one", "two", "three", "four"] as const;

const SECURITY_KEYS = ["canada", "encryption", "access", "privacy"] as const;

const SECURITY_ICONS = {
  canada: MapPin,
  encryption: LockKeyhole,
  access: ShieldCheck,
  privacy: ScrollText,
} as const;

const STAGE_CHIP_KEYS = ["forms", "booking", "square", "documents"] as const;

const SHOWCASE_KEYS = [
  "client",
  "representative",
  "booking",
  "dashboard",
] as const;

const SHOWCASE_GLOW = {
  client: "indigo",
  representative: "emerald",
  booking: "amber",
  dashboard: "indigo",
} as const;

function ShowcaseCopy({
  title,
  points,
  align = "start",
}: {
  title: string;
  points: string[];
  align?: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "space-y-4 lg:max-w-md",
        align === "end" && "lg:justify-self-end",
      )}
    >
      <h3 className="font-heading text-2xl font-semibold tracking-tight text-brand text-pretty sm:text-3xl">
        {title}
      </h3>
      <ul className="space-y-2.5">
        {points.map((point) => (
          <li
            key={point}
            className="flex gap-2.5 text-[15px] leading-relaxed text-muted-foreground"
          >
            <span
              className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-action"
              aria-hidden
            />
            <span className="text-pretty">{point}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DarkBand({
  children,
  planes = false,
  className,
}: {
  children: React.ReactNode;
  planes?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden bg-graphite-900 text-white",
        className,
      )}
    >
      <div
        aria-hidden
        className="lp-dark-veil pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="lp-dark-grid pointer-events-none absolute inset-0 opacity-[0.14]"
      />
      <HeroAtmosphere planes={planes} />
      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        {children}
      </div>
    </section>
  );
}

function LandingReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("lp-reveal", className)}>{children}</div>;
}

function featureIconClass(
  tone: (typeof FEATURE_TONES)[keyof typeof FEATURE_TONES],
) {
  if (tone === "emerald") return "bg-emerald-100 text-success";
  if (tone === "amber") return "bg-amber-100 text-warning";
  return "bg-indigo-100 text-action";
}

export async function LandingPage() {
  const [t, pricing] = await Promise.all([
    getTranslations("home"),
    getTranslations("pricing"),
  ]);
  const nav = {
    pricing: t("navPricing"),
    signIn: t("navSignIn"),
    cta: t("navCta"),
    footerTagline: t("footerTagline"),
  };

  return (
    <main className="landing-page relative flex min-h-full flex-1 flex-col overflow-x-hidden bg-canvas">
      <MarketingHeader copy={nav} active="home" />
      <MarketingTestingBanner>{pricing("testingBanner")}</MarketingTestingBanner>

      <section className="relative isolate overflow-hidden bg-graphite-900 text-white">
        <div
          aria-hidden
          className="lp-dark-veil pointer-events-none absolute inset-0"
        />
        <div
          aria-hidden
          className="lp-dark-grid pointer-events-none absolute inset-0 opacity-[0.14]"
        />
        <HeroAtmosphere />

        <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-16 sm:py-20 lg:py-24">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-10">
            <div className="max-w-xl space-y-6">
              <p className="lp-fade text-sm font-semibold tracking-[0.16em] text-white/55 uppercase">
                {t("audience")}
              </p>
              <div className="lp-fade lp-delay-1">
                <BrandLogo size="hero" href={null} inverted />
              </div>
              <h1 className="lp-fade lp-delay-2 font-heading text-3xl font-bold tracking-tight text-pretty text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
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
              <p className="lp-fade lp-delay-4 text-sm text-white/55 text-pretty">
                {t("ctaNote")}
              </p>
            </div>

            <div className="lp-fade lp-delay-3 overflow-visible">
              <HeroProductStage
                chips={STAGE_CHIP_KEYS.map((key) => ({
                  key,
                  label: t(`capabilities.${key}`),
                }))}
              />
            </div>
          </div>

          <div className="lp-marquee-wrap lp-fade lp-delay-5 mt-14">
            <ul className="lp-marquee flex w-max gap-2">
              {[...CAPABILITY_KEYS, ...CAPABILITY_KEYS].map((key, index) => (
                <li
                  key={`${key}-${index}`}
                  className="rounded-full border border-white/12 bg-white/6 px-3 py-1 text-xs font-medium whitespace-nowrap text-white/70"
                >
                  {t(`capabilities.${key}`)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-border bg-canvas py-20 sm:py-24">
        <div
          aria-hidden
          className="lp-light-grid pointer-events-none absolute inset-0 opacity-70"
        />
        <div className="relative mx-auto w-full max-w-6xl space-y-20 px-6">
          <LandingReveal>
            <h2 className="max-w-3xl font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("showcases.title")}
            </h2>
          </LandingReveal>

          {SHOWCASE_KEYS.map((key, index) => {
            const previewFirst = index % 2 === 1;
            const rawPoints = t.raw(`showcases.${key}.points`);
            const points = Array.isArray(rawPoints)
              ? rawPoints.filter(
                  (point): point is string => typeof point === "string",
                )
              : [];
            const preview =
              key === "client" ? (
                <ClientPortalPreview />
              ) : key === "representative" ? (
                <AppProjectPreview />
              ) : key === "booking" ? (
                <PublicBookingPreview />
              ) : (
                <AppHomePreview tone="light" />
              );
            const glow = SHOWCASE_GLOW[key];

            return (
              <LandingReveal key={key}>
                <div
                  className={cn(
                    "grid items-center gap-10 lg:gap-14",
                    previewFirst
                      ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]"
                      : "lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]",
                  )}
                >
                  <ShowcaseCopy
                    title={t(`showcases.${key}.title`)}
                    points={points}
                    align={previewFirst ? "start" : "end"}
                  />
                  <div
                    className={cn(
                      "lp-shot-stage pointer-events-none select-none",
                      previewFirst
                        ? "order-first"
                        : "order-first lg:order-last",
                    )}
                  >
                    <div
                      className={cn(
                        "lp-shot-glow",
                        glow === "emerald" && "lp-shot-glow-emerald",
                        glow === "amber" && "lp-shot-glow-amber",
                      )}
                    />
                    <div
                      className={cn(
                        "lp-shot-frame",
                        previewFirst && "lp-shot-frame-alt",
                      )}
                    >
                      {preview}
                    </div>
                  </div>
                </div>
              </LandingReveal>
            );
          })}
        </div>
      </section>

      <DarkBand>
        <LandingReveal>
          <p className="text-sm font-semibold tracking-[0.16em] text-white/55 uppercase">
            {t("integrations.eyebrow")}
          </p>
          <h2 className="mt-3 max-w-3xl font-heading text-3xl font-bold tracking-tight text-pretty text-white sm:text-4xl">
            {t("integrations.title")}
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-pretty text-white/70">
            {t("integrations.subtitle")}
          </p>
        </LandingReveal>

        <LandingReveal className="mt-12">
          <div className="space-y-5">
            <div className="space-y-2">
              <h3 className="font-heading text-lg font-semibold tracking-tight text-white">
                {t("integrations.groups.builtin.title")}
              </h3>
              <p className="max-w-2xl text-[15px] leading-relaxed text-pretty text-white/65">
                {t("integrations.groups.builtin.help")}
              </p>
            </div>
            <ul className="grid gap-4 sm:grid-cols-2">
              {BUILTIN_ITEMS.map((item) => {
                const Icon = item.Icon;
                return (
                  <li
                    key={item.key}
                    className="lp-integration-card space-y-3 rounded-xl border border-white/12 bg-white/6 p-5"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald/15">
                        <Icon
                          className="size-6 text-emerald-100"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h4 className="font-heading text-base font-semibold text-white">
                          {t(`integrations.${item.key}.title`)}
                        </h4>
                        <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-emerald-100/20 bg-emerald/15 px-2 text-[11px] font-medium text-emerald-100">
                          {t("integrations.included")}
                        </span>
                      </div>
                    </div>
                    <p className="text-[15px] leading-relaxed text-pretty text-white/65">
                      {t(`integrations.${item.key}.body`)}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        </LandingReveal>

        <LandingReveal className="mt-10">
          <div className="lp-marquee-wrap">
            <ul className="lp-marquee flex w-max gap-3">
              {[...INTEGRATION_MARQUEE, ...INTEGRATION_MARQUEE].map(
                (item, index) => {
                  const Logo = item.Logo;
                  return (
                    <li
                      key={`${item.key}-${index}`}
                      className="flex items-center gap-2 rounded-full border border-white/12 bg-white/6 px-3 py-1.5"
                    >
                      <Logo className="size-6" />
                      <span className="text-xs font-medium whitespace-nowrap text-white/75">
                        {t(`integrations.${item.key}.title`)}
                      </span>
                    </li>
                  );
                },
              )}
            </ul>
          </div>
        </LandingReveal>

        <div className="mt-14 space-y-12">
          {INTEGRATION_GROUPS.map((group) => (
            <LandingReveal key={group.key}>
              <div className="space-y-5">
                <div className="space-y-2">
                  <h3 className="font-heading text-lg font-semibold tracking-tight text-white">
                    {t(`integrations.groups.${group.key}.title`)}
                  </h3>
                  <p className="max-w-2xl text-[15px] leading-relaxed text-pretty text-white/65">
                    {t(`integrations.groups.${group.key}.help`)}
                  </p>
                </div>
                <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => {
                    const Logo = item.Logo;
                    return (
                      <li
                        key={item.key}
                        className="lp-integration-card space-y-3 rounded-xl border border-white/12 bg-white/6 p-5"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-white/12 bg-white p-1">
                            <Logo className="size-9" />
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h4 className="font-heading text-base font-semibold text-white">
                              {t(`integrations.${item.key}.title`)}
                            </h4>
                            {item.beta ? (
                              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-white/15 bg-white/8 px-2 text-[11px] font-medium text-white/60">
                                {t("integrations.beta")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-[15px] leading-relaxed text-pretty text-white/65">
                          {t(`integrations.${item.key}.body`)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </LandingReveal>
          ))}
        </div>
      </DarkBand>

      <section className="relative overflow-hidden border-b border-border bg-surface py-20 sm:py-24">
        <div
          aria-hidden
          className="lp-light-grid pointer-events-none absolute inset-0 opacity-50"
        />
        <div className="relative mx-auto w-full max-w-6xl px-6">
          <LandingReveal>
            <h2 className="max-w-2xl font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("featuresTitle")}
            </h2>
          </LandingReveal>

          <ul className="mt-12 grid gap-4 sm:grid-cols-2">
            {FEATURE_KEYS.map((key) => {
              const Icon = FEATURE_ICONS[key];
              return (
                <li key={key}>
                  <LandingReveal className="h-full">
                    <article className="lp-feature-card h-full space-y-3 rounded-xl border border-border bg-surface p-6">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-xl",
                            featureIconClass(FEATURE_TONES[key]),
                          )}
                        >
                          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                        </span>
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <h3 className="font-heading text-base font-semibold text-brand">
                            {t(`features.${key}.title`)}
                          </h3>
                          {FEATURE_BETA.has(key) ? (
                            <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-secondary px-2 text-[11px] font-medium text-muted-foreground">
                              {t("integrations.beta")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                        {t(`features.${key}.body`)}
                      </p>
                    </article>
                  </LandingReveal>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="relative overflow-hidden border-b border-border bg-canvas py-20 sm:py-24">
        <div className="relative mx-auto w-full max-w-6xl px-6">
          <LandingReveal>
            <h2 className="max-w-2xl font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("howTitle")}
            </h2>
          </LandingReveal>

          <LandingReveal className="mt-12">
            <div className="lp-steps relative">
              <span className="lp-steps-line hidden lg:block" aria-hidden />
              <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
                {HOW_KEYS.map((key, index) => (
                  <li key={key} className="relative space-y-3">
                    <span className="inline-flex size-11 items-center justify-center rounded-full bg-indigo-100 font-heading text-sm font-bold tracking-wide text-action">
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
          </LandingReveal>
        </div>
      </section>

      <DarkBand>
        <LandingReveal>
          <h2 className="max-w-3xl font-heading text-3xl font-bold tracking-tight text-pretty text-white sm:text-4xl">
            {t("securityTitle")}
          </h2>
        </LandingReveal>

        <LandingReveal className="mt-10">
          <div className="lp-noai flex max-w-3xl items-start gap-4 rounded-xl p-6">
            <Workflow
              className="mt-0.5 size-6 shrink-0 text-emerald-100"
              strokeWidth={1.75}
              aria-hidden
            />
            <div className="space-y-2">
              <h3 className="font-heading text-lg font-semibold text-white">
                {t("security.noAi.title")}
              </h3>
              <p className="text-[15px] leading-relaxed text-pretty text-white/70 sm:text-base">
                {t("security.noAi.body")}
              </p>
            </div>
          </div>
        </LandingReveal>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {SECURITY_KEYS.map((key) => {
            const Icon = SECURITY_ICONS[key];
            return (
              <li key={key}>
                <LandingReveal className="h-full">
                  <article className="lp-integration-card h-full space-y-3 rounded-xl border border-white/12 bg-white/6 p-5">
                    <div className="flex items-center gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald/15">
                        <Icon
                          className="size-5 text-emerald-100"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                      </span>
                      <h3 className="font-heading text-base font-semibold text-white">
                        {t(`security.${key}.title`)}
                      </h3>
                    </div>
                    <p className="text-[15px] leading-relaxed text-pretty text-white/65">
                      {t(`security.${key}.body`)}
                    </p>
                  </article>
                </LandingReveal>
              </li>
            );
          })}
        </ul>

        <LandingReveal className="mt-10">
          <Link
            href="/privacy"
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white",
            )}
          >
            {t("securityCta")}
          </Link>
        </LandingReveal>
      </DarkBand>

      <section className="relative overflow-hidden border-b border-border bg-canvas py-20 sm:py-24">
        <div
          aria-hidden
          className="lp-light-grid pointer-events-none absolute inset-0 opacity-60"
        />
        <div className="relative mx-auto w-full max-w-6xl px-6">
          <LandingReveal>
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {pricing("title")}
            </h2>
          </LandingReveal>

          <LandingReveal className="mt-10">
            <PricingPlanCards variant="teaser" />
          </LandingReveal>

          <LandingReveal className="mt-8">
            <Link
              href="/pricing"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {pricing("teaser.compare")}
            </Link>
          </LandingReveal>
        </div>
      </section>

      <MarketingFinalCta
        title={t("finalTitle")}
        subtitle={t("finalSubtitle")}
        cta={t("finalCta")}
        secondaryCta={t("secondaryCta")}
        note={t("finalNote")}
        atmosphere
      />
      <MarketingFooter copy={nav} />
    </main>
  );
}
