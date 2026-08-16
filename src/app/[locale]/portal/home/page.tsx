import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";

import { SurfaceCard } from "@/components/layout/surface-card";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { formatPriceCents } from "@/lib/booking/slots";
import { loadPortalHub } from "@/lib/portal/queries";
import { ProjectStatusSummary } from "@/components/projects/project-status-summary";
import { cn } from "@/lib/utils";

export default async function PortalHomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const hub = await loadPortalHub(locale);
  if (!hub) {
    redirect({ href: "/portal", locale });
    return null;
  }

  const t = await getTranslations("portal");
  const tprog = await getTranslations("programs");
  const tr = await getTranslations("roles");
  const tp = await getTranslations("publicPay");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-8">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("hello", { name: hub.person.firstName })}
        </h1>
        <p className="text-[15px] text-muted-foreground">{t("lede")}</p>
      </header>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("files")}
        </h2>
        {hub.projects.length === 0 ? (
          <SurfaceCard>
            <p className="text-[15px] text-muted-foreground">{t("noFiles")}</p>
          </SurfaceCard>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
            {hub.projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={`/portal/projects/${project.id}`}
                  className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium text-brand">{project.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {tprog(project.programFamily)} · {tr(project.role)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("progress", {
                        forms: project.formPercent,
                        docsDone: project.docsDone,
                        docsTotal: project.docsTotal,
                      })}
                    </p>
                  </div>
                  <ProjectStatusSummary
                    status={project.status}
                    statusAt={project.statusAt}
                    locale={locale}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("payments")}
        </h2>
        {hub.payments.length === 0 ? (
          <SurfaceCard>
            <p className="text-[15px] text-muted-foreground">{t("noPayments")}</p>
          </SurfaceCard>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
            {hub.payments.map((payment) => {
              const pending =
                payment.status === "pending" && Boolean(payment.checkoutUrl);
              return (
                <li
                  key={payment.id}
                  className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-medium text-brand">{payment.description}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatPriceCents(
                        payment.amountCents,
                        locale,
                        payment.currency,
                      )}{" "}
                      · {t(`paymentStatus.${payment.status}`)}
                    </p>
                  </div>
                  {pending ? (
                    <a
                      href={payment.checkoutUrl ?? undefined}
                      className={cn(
                        buttonVariants({ size: "sm" }),
                        "bg-action text-action-foreground hover:bg-action/90",
                      )}
                    >
                      {tp("payWithSquare")}
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-heading text-lg font-semibold text-brand">
          {t("appointments")}
        </h2>
        {hub.appointments.length === 0 ? (
          <SurfaceCard>
            <p className="text-[15px] text-muted-foreground">
              {t("noAppointments")}
            </p>
          </SurfaceCard>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface shadow-elevated">
            {hub.appointments.map((appointment) => (
              <li
                key={appointment.id}
                className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-brand">
                    {appointment.serviceTitle || t("appointmentFallback")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(appointment.startsAt).toLocaleString(
                      locale === "fr" ? "fr-CA" : locale === "es" ? "es" : "en-CA",
                      {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      },
                    )}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {appointment.meetJoinUrl &&
                  appointment.status !== "cancelled" ? (
                    <a
                      href={appointment.meetJoinUrl}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      {t("joinMeet")}
                    </a>
                  ) : null}
                  {appointment.manageUrl &&
                  appointment.status !== "cancelled" ? (
                    <a
                      href={appointment.manageUrl}
                      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                    >
                      {t("manage")}
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "portal" });
  return { title: t("homeTitle") };
}
