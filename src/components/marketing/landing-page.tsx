import {
  CalendarDays,
  FileStack,
  FolderKanban,
  Globe2,
  Link2,
  LockKeyhole,
  MapPin,
  ScrollText,
  ShieldCheck,
  Users,
  UsersRound,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { BrandLogo } from "@/components/brand/brand-logo";
import { PrivacyLink } from "@/components/legal/privacy-link";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const FEATURE_KEYS = [
  "projects",
  "people",
  "forms",
  "share",
  "booking",
  "portal",
  "team",
  "languages",
] as const;

const FEATURE_ICONS = {
  projects: FolderKanban,
  people: Users,
  forms: FileStack,
  share: Link2,
  booking: CalendarDays,
  portal: LockKeyhole,
  team: UsersRound,
  languages: Globe2,
} as const;

const HOW_KEYS = ["one", "two", "three"] as const;

const SECURITY_KEYS = ["canada", "encryption", "access", "privacy"] as const;

const SECURITY_ICONS = {
  canada: MapPin,
  encryption: LockKeyhole,
  access: ShieldCheck,
  privacy: ScrollText,
} as const;

function ProductPreview() {
  return (
    <div
      aria-hidden
      className="landing-preview relative mx-auto w-full max-w-5xl overflow-hidden rounded-t-[1.25rem] border border-white/10 border-b-0 bg-graphite-900 shadow-[0_-24px_80px_-20px_color-mix(in_srgb,var(--graphite-900)_55%,transparent)]"
    >
      <div className="flex items-center gap-2 border-b border-white/8 px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <span className="size-2.5 rounded-full bg-white/20" />
        <div className="ml-3 h-6 flex-1 rounded-md bg-white/6" />
      </div>
      <div className="grid grid-cols-[7.5rem_1fr] sm:grid-cols-[10rem_1fr]">
        <div className="space-y-3 border-r border-white/8 bg-graphite-700 p-4">
          <div className="h-2.5 w-16 rounded bg-action/80" />
          <div className="h-2 w-12 rounded bg-white/15" />
          <div className="h-2 w-14 rounded bg-white/10" />
          <div className="h-2 w-10 rounded bg-white/10" />
          <div className="h-2 w-16 rounded bg-white/10" />
        </div>
        <div className="space-y-4 p-4 sm:p-5">
          <div className="flex items-end justify-between gap-4">
            <div className="space-y-2">
              <div className="h-3 w-28 rounded bg-white/25" />
              <div className="h-2 w-40 rounded bg-white/10" />
            </div>
            <div className="h-8 w-24 rounded-lg bg-action/90" />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-white/4 p-3">
              <div className="mb-3 h-2 w-16 rounded bg-success/70" />
              <div className="h-8 rounded-md bg-white/8" />
            </div>
            <div className="rounded-xl border border-white/8 bg-white/4 p-3">
              <div className="mb-3 h-2 w-14 rounded bg-warning/70" />
              <div className="h-8 rounded-md bg-white/8" />
            </div>
            <div className="hidden rounded-xl border border-white/8 bg-white/4 p-3 sm:block">
              <div className="mb-3 h-2 w-20 rounded bg-action/70" />
              <div className="h-8 rounded-md bg-white/8" />
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-white/8">
            <div className="grid grid-cols-4 gap-px bg-white/8">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 bg-graphite-900/70 sm:h-9"
                  style={{ opacity: 0.55 + (i % 4) * 0.1 }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
          </div>

          <div className="relative mt-4 w-full">
            <ProductPreview />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-canvas to-transparent"
            />
          </div>
        </div>
      </section>

      <section className="relative z-10 border-b border-border bg-canvas py-20 sm:py-24">
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

          <ul className="mt-12 divide-y divide-border border-y border-border">
            {FEATURE_KEYS.map((key) => {
              const Icon = FEATURE_ICONS[key];
              return (
                <li
                  key={key}
                  className="grid gap-3 py-6 sm:grid-cols-[2.5rem_minmax(0,14rem)_1fr] sm:items-start sm:gap-6"
                >
                  <Icon
                    className="mt-0.5 size-5 text-action"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                  <h3 className="font-heading text-base font-semibold text-brand">
                    {t(`features.${key}.title`)}
                  </h3>
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

          <ol className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-8">
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
            <PrivacyLink className="text-white/45 hover:text-white/70" />
          </div>
        </div>
      </footer>
    </main>
  );
}
