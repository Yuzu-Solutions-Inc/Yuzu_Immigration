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

const FEATURE_BETA = new Set<(typeof FEATURE_KEYS)[number]>(["sage"]);

const INTEGRATION_GROUPS = [
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
] as const;

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
        "space-y-3 lg:max-w-md",
        align === "end" && "lg:justify-self-end",
      )}
    >
      <h3 className="font-heading text-2xl font-semibold tracking-tight text-brand text-pretty">
        {title}
      </h3>
      <ul className="space-y-2">
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
      <style>{`
        @keyframes landing-fade-up {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lp-grid-pan {
          to { background-position: 48px 48px; }
        }
        @keyframes lp-orb-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(6%, 8%) scale(1.12); }
        }
        @keyframes lp-orb-drift-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-10%, 4%) scale(1.08); }
        }
        @keyframes lp-orb-drift-c {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(4%, -8%) scale(1.16); }
        }
        @keyframes lp-plane-a {
          0% { transform: translate(-18%, 78%) rotate(-16deg); opacity: 0; }
          10% { opacity: 0.5; }
          90% { opacity: 0.35; }
          100% { transform: translate(112%, 6%) rotate(14deg); opacity: 0; }
        }
        @keyframes lp-plane-b {
          0% { transform: translate(108%, 62%) rotate(28deg) scaleX(-1); opacity: 0; }
          12% { opacity: 0.28; }
          88% { opacity: 0.2; }
          100% { transform: translate(-20%, 18%) rotate(8deg) scaleX(-1); opacity: 0; }
        }
        @keyframes lp-plane-c {
          0% { transform: translate(-10%, 40%) rotate(-8deg); opacity: 0; }
          15% { opacity: 0.22; }
          85% { opacity: 0.18; }
          100% { transform: translate(80%, -8%) rotate(18deg); opacity: 0; }
        }
        @keyframes lp-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-12px); }
        }
        @keyframes lp-stage-idle {
          0%, 100% { transform: perspective(1400px) rotateY(-11deg) rotateX(5deg) translateY(0); }
          50% { transform: perspective(1400px) rotateY(-7deg) rotateX(3deg) translateY(-10px); }
        }
        @keyframes lp-card-idle {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-14px) rotate(-1deg); }
        }
        @keyframes lp-glow-pulse {
          0%, 100% { opacity: 0.45; transform: scale(1); }
          50% { opacity: 0.75; transform: scale(1.08); }
        }
        @keyframes lp-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .landing-page .lp-fade {
          animation: landing-fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .landing-page .lp-delay-1 { animation-delay: 0.08s; }
        .landing-page .lp-delay-2 { animation-delay: 0.16s; }
        .landing-page .lp-delay-3 { animation-delay: 0.24s; }
        .landing-page .lp-atmosphere {
          --lp-mx: 0;
          --lp-my: 0;
        }
        .landing-page .lp-parallax {
          will-change: transform;
          transition: transform 0.5s ease-out;
        }
        .landing-page .lp-parallax-slow {
          transform: translate(calc(var(--lp-mx) * 18px), calc(var(--lp-my) * 14px));
        }
        .landing-page .lp-parallax-fast {
          transform: translate(calc(var(--lp-mx) * 36px), calc(var(--lp-my) * 24px));
        }
        .landing-page .lp-grid {
          animation: lp-grid-pan 32s linear infinite;
        }
        .landing-page .lp-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(48px);
          will-change: transform;
        }
        .landing-page .lp-orb-indigo {
          width: min(52vw, 34rem);
          height: min(48vw, 30rem);
          left: -8%;
          top: -16%;
          background: color-mix(in srgb, var(--indigo-500) 42%, transparent);
          animation: lp-orb-drift 18s ease-in-out infinite;
        }
        .landing-page .lp-orb-emerald {
          width: min(38vw, 22rem);
          height: min(38vw, 22rem);
          right: -6%;
          top: 8%;
          background: color-mix(in srgb, var(--emerald-500) 22%, transparent);
          animation: lp-orb-drift-b 22s ease-in-out infinite;
        }
        .landing-page .lp-orb-amber {
          width: min(32vw, 18rem);
          height: min(28vw, 16rem);
          right: 18%;
          bottom: 6%;
          background: color-mix(in srgb, var(--amber-500) 16%, transparent);
          animation: lp-orb-drift-c 16s ease-in-out infinite;
        }
        .landing-page .lp-plane {
          position: absolute;
          top: 0;
          left: 0;
          color: white;
          will-change: transform, opacity;
        }
        .landing-page .lp-plane-a { animation: lp-plane-a 22s linear infinite; }
        .landing-page .lp-plane-b { animation: lp-plane-b 28s linear infinite 4s; }
        .landing-page .lp-plane-c { animation: lp-plane-c 18s linear infinite 9s; }
        .landing-page .landing-stage {
          min-height: 22rem;
        }
        .landing-page .lp-stage-glow {
          pointer-events: none;
          position: absolute;
          inset: 12% 8% 8% 8%;
          border-radius: 999px;
          background: color-mix(in srgb, var(--indigo-500) 28%, transparent);
          filter: blur(48px);
          animation: lp-glow-pulse 7s ease-in-out infinite;
        }
        .landing-page .lp-stage-main {
          position: relative;
          z-index: 2;
          transform-origin: center;
          animation: lp-stage-idle 9s ease-in-out infinite;
        }
        .landing-page .lp-stage-card {
          position: absolute;
          z-index: 3;
          width: min(58%, 17rem);
          left: -6%;
          bottom: 4%;
          animation: lp-card-idle 6.5s ease-in-out infinite;
          filter: drop-shadow(0 18px 40px color-mix(in srgb, var(--graphite-900) 45%, transparent));
        }
        .landing-page .lp-stage-chips {
          position: absolute;
          inset: 0;
          z-index: 4;
          pointer-events: none;
        }
        .landing-page .lp-stage-chip {
          position: absolute;
          border-radius: 999px;
          border: 1px solid rgba(255,255,255,0.16);
          background: color-mix(in srgb, var(--graphite-900) 35%, transparent);
          backdrop-filter: blur(10px);
          padding: 0.4rem 0.8rem;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.01em;
          color: rgba(255,255,255,0.88);
          animation: lp-float 5.5s ease-in-out infinite;
          white-space: nowrap;
        }
        .landing-page .lp-stage-chip-1 { top: 6%; right: 2%; animation-delay: 0s; }
        .landing-page .lp-stage-chip-2 { top: 32%; right: -2%; animation-delay: 0.7s; }
        .landing-page .lp-stage-chip-3 { bottom: 18%; right: 8%; animation-delay: 1.3s; }
        .landing-page .lp-stage-chip-4 { top: 18%; left: 2%; animation-delay: 1.9s; }
        .landing-page .lp-marquee-wrap {
          overflow: hidden;
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
        }
        .landing-page .lp-marquee {
          animation: lp-marquee 28s linear infinite;
        }
        .landing-page .lp-marquee-wrap:hover .lp-marquee {
          animation-play-state: paused;
        }
        @media (max-width: 1023px) {
          .landing-page .lp-stage-card { width: min(64%, 15rem); left: -2%; }
          .landing-page .lp-stage-chip-2,
          .landing-page .lp-stage-chip-4 { display: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .landing-page .lp-fade,
          .landing-page .lp-grid,
          .landing-page .lp-orb,
          .landing-page .lp-plane,
          .landing-page .lp-stage-glow,
          .landing-page .lp-stage-main,
          .landing-page .lp-stage-card,
          .landing-page .lp-stage-chip,
          .landing-page .lp-marquee {
            animation: none !important;
          }
        }
      `}</style>

      <MarketingHeader copy={nav} active="home" />
      <MarketingTestingBanner>{pricing("testingBanner")}</MarketingTestingBanner>

      <section className="relative isolate overflow-hidden bg-graphite-900 text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, var(--graphite-700) 0%, var(--graphite-900) 42%, var(--graphite-900) 100%)",
          }}
        />
        <div
          aria-hidden
          className="lp-grid pointer-events-none absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse at center, black 18%, transparent 78%)",
          }}
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

          <div className="lp-marquee-wrap lp-fade lp-delay-4 mt-14">
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

      <section className="relative z-10 border-b border-border bg-canvas py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl space-y-20 px-6">
          <div className="max-w-3xl">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("showcases.title")}
            </h2>
          </div>

          {SHOWCASE_KEYS.map((key, index) => {
            const previewFirst = index % 2 === 1;
            const rawPoints = t.raw(`showcases.${key}.points`);
            const points = Array.isArray(rawPoints)
              ? rawPoints.filter((point): point is string => typeof point === "string")
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

            return (
              <div
                key={key}
                className={cn(
                  "grid items-center gap-8 lg:gap-12",
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
                    "pointer-events-none select-none",
                    previewFirst
                      ? "order-first"
                      : "order-first lg:order-last",
                  )}
                >
                  {preview}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="border-b border-border bg-surface py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("integrations.title")}
            </h2>
          </div>
          <div className="mt-12 space-y-14">
            {INTEGRATION_GROUPS.map((group) => (
              <div key={group.key} className="space-y-6">
                <h3 className="font-heading text-lg font-semibold tracking-tight text-brand">
                  {t(`integrations.groups.${group.key}.title`)}
                </h3>
                <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
                  {group.items.map((item) => {
                    const Logo = item.Logo;
                    return (
                      <li key={item.key} className="space-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-border bg-surface p-1 shadow-sm">
                            <Logo className="size-9" />
                          </div>
                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <h4 className="font-heading text-base font-semibold text-brand">
                              {t(`integrations.${item.key}.title`)}
                            </h4>
                            {item.beta ? (
                              <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-secondary px-2 text-[11px] font-medium text-muted-foreground">
                                {t("integrations.beta")}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <p className="text-[15px] leading-relaxed text-muted-foreground text-pretty">
                          {t(`integrations.${item.key}.body`)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-canvas py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("featuresTitle")}
            </h2>
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
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="border-b border-border bg-surface py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="max-w-2xl">
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
          <div className="max-w-3xl">
            <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
              {t("securityTitle")}
            </h2>
          </div>

          <div className="mt-12 space-y-3">
            <div className="flex items-center gap-3">
              <Workflow
                className="size-5 text-success"
                strokeWidth={1.75}
                aria-hidden
              />
              <h3 className="font-heading text-lg font-semibold text-brand">
                {t("security.noAi.title")}
              </h3>
            </div>
            <p className="max-w-2xl text-[15px] leading-relaxed text-muted-foreground text-pretty sm:text-base">
              {t("security.noAi.body")}
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

      <section className="border-b border-border bg-surface py-20 sm:py-24">
        <div className="mx-auto w-full max-w-6xl px-6">
          <h2 className="font-heading text-3xl font-bold tracking-tight text-brand text-pretty sm:text-4xl">
            {pricing("title")}
          </h2>

          <div className="mt-10">
            <PricingPlanCards variant="teaser" />
          </div>

          <div className="mt-8">
            <Link
              href="/pricing"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              {pricing("teaser.compare")}
            </Link>
          </div>
        </div>
      </section>

      <MarketingFinalCta
        title={t("finalTitle")}
        cta={t("finalCta")}
        secondaryCta={t("secondaryCta")}
      />
      <MarketingFooter copy={nav} />
    </main>
  );
}
