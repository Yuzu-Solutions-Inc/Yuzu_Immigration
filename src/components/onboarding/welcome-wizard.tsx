"use client";

import {
  Briefcase,
  CalendarDays,
  Check,
  CreditCard,
  FileText,
  FolderKanban,
  Users,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { toast } from "sonner";

import { applyWeekdayHoursPresetAction } from "@/app/actions/booking";
import {
  completeOnboardingAction,
  dismissOnboardingAction,
  skipOnboardingIntegrationsAction,
} from "@/app/actions/onboarding";
import {
  createServiceAction,
  type ServiceActionState,
} from "@/app/actions/services";
import {
  updateAccountSettingsAction,
  type SettingsActionState,
} from "@/app/actions/settings";
import {
  inviteOrgMemberAction,
  type TeamActionState,
} from "@/app/actions/team";
import {
  StaffCalendarIntegrations,
  StaffMeetingIntegrations,
} from "@/components/booking/staff-integrations";
import { SurfaceCard } from "@/components/layout/surface-card";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGrid,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Link, useRouter } from "@/i18n/navigation";
import type {
  CalendarProvider,
  MeetingProvider,
} from "@/lib/booking/integrations";
import type {
  GoogleCalendarConnectionPublic,
  MicrosoftCalendarConnectionPublic,
  ZoomConnectionPublic,
} from "@/lib/booking/types";
import type { AppLocale } from "@/lib/i18n/locales";
import {
  isIntegrationCheckId,
  wizardStepsForRole,
  type OnboardingChecks,
} from "@/lib/onboarding/steps";
import { cn } from "@/lib/utils";

const emptySettings: SettingsActionState = {};
const emptyService: ServiceActionState = {};
const emptyTeam: TeamActionState = {};

export type WelcomeWizardProps = {
  locale: AppLocale;
  isAdmin: boolean;
  fullName: string;
  checks: OnboardingChecks;
  googleConfigured: boolean;
  googleConnection: GoogleCalendarConnectionPublic | null;
  microsoftConfigured: boolean;
  microsoftConnection: MicrosoftCalendarConnectionPublic | null;
  zoomConfigured: boolean;
  zoomConnection: ZoomConnectionPublic | null;
  calendarProvider: CalendarProvider | null;
  meetingProvider: MeetingProvider | null;
};

export function WelcomeWizard(props: WelcomeWizardProps) {
  const {
    locale,
    isAdmin,
    fullName,
    checks,
    googleConfigured,
    googleConnection,
    microsoftConfigured,
    microsoftConnection,
    zoomConfigured,
    zoomConnection,
    calendarProvider,
    meetingProvider,
  } = props;
  const t = useTranslations("welcome");
  const tRoles = useTranslations("orgRoles");
  const router = useRouter();
  const steps = useMemo(() => wizardStepsForRole(isAdmin), [isAdmin]);
  const [index, setIndex] = useState(0);
  const [pending, startTransition] = useTransition();
  const [skippedIntegrations, setSkippedIntegrations] = useState(
    () => new Set<string>(),
  );
  const step = steps[index] ?? "tour";

  const [profileState, profileAction, profilePending] = useActionState(
    updateAccountSettingsAction,
    emptySettings,
  );
  const [serviceState, serviceAction, servicePending] = useActionState(
    createServiceAction,
    emptyService,
  );
  const [inviteState, inviteAction, invitePending] = useActionState(
    inviteOrgMemberAction,
    emptyTeam,
  );
  useEffect(() => {
    if (
      profileState.success ||
      serviceState.message === "created" ||
      inviteState.message
    ) {
      router.refresh();
    }
    if (profileState.success) {
      // Existing action-driven wizard progression intentionally follows success.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIndex((current) => Math.min(current + 1, steps.length - 1));
    }
  }, [
    profileState.success,
    serviceState.message,
    inviteState.message,
    inviteState.error,
    router,
    steps.length,
  ]);

  const effectiveChecks: OnboardingChecks = {
    ...checks,
    calendar: checks.calendar || skippedIntegrations.has("calendar"),
    meeting: checks.meeting || skippedIntegrations.has("meeting"),
  };

  function markIntegrationSkippedIfNeeded(stepId: typeof step) {
    if (!isIntegrationCheckId(stepId) || effectiveChecks[stepId]) return;
    setSkippedIntegrations((current) => new Set(current).add(stepId));
    startTransition(() => {
      void skipOnboardingIntegrationsAction(locale, [stepId]);
    });
  }

  function goNext() {
    markIntegrationSkippedIfNeeded(step);
    setIndex((current) => Math.min(current + 1, steps.length - 1));
    router.refresh();
  }

  function goBack() {
    setIndex((current) => Math.max(current - 1, 0));
  }

  function skipSetup() {
    startTransition(async () => {
      const result = await dismissOnboardingAction(locale);
      if (result && "error" in result) toast.error(t("saveError"));
    });
  }

  function finish() {
    startTransition(async () => {
      const result = await completeOnboardingAction(locale);
      if (result && "error" in result) toast.error(t("saveError"));
    });
  }

  function applyHours() {
    startTransition(async () => {
      const result = await applyWeekdayHoursPresetAction(locale);
      if (result.error) {
        toast.error(t("saveError"));
        return;
      }
      toast.success(t("hours.applied"));
      router.refresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("kicker", { current: index + 1, total: steps.length })}
          </p>
          <h1 className="font-heading text-2xl font-semibold text-brand">
            {t(`steps.${step}.title`)}
          </h1>
          <p className="text-[15px] text-pretty text-muted-foreground">
            {t(`steps.${step}.body`)}
          </p>
        </div>
        {step !== "done" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={skipSetup}
            disabled={pending}
          >
            {t("skipAll")}
          </Button>
        ) : null}
      </div>

      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={steps.length}
        aria-valuenow={index + 1}
        aria-label={t("kicker", { current: index + 1, total: steps.length })}
      >
        <div
          className="h-full rounded-full bg-action transition-[width] duration-300"
          style={{ width: `${((index + 1) / steps.length) * 100}%` }}
        />
      </div>

      <SurfaceCard className="space-y-5 sm:p-6">
        {step === "tour" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FeatureCard
              icon={FolderKanban}
              title={t("features.projects.title")}
              body={t("features.projects.body")}
            />
            <FeatureCard
              icon={Users}
              title={t("features.clients.title")}
              body={t("features.clients.body")}
            />
            <FeatureCard
              icon={FileText}
              title={t("features.forms.title")}
              body={t("features.forms.body")}
            />
            <FeatureCard
              icon={CalendarDays}
              title={t("features.booking.title")}
              body={t("features.booking.body")}
            />
            {isAdmin ? (
              <>
                <FeatureCard
                  icon={Briefcase}
                  title={t("features.services.title")}
                  body={t("features.services.body")}
                />
                <FeatureCard
                  icon={CreditCard}
                  title={t("features.payments.title")}
                  body={t("features.payments.body")}
                />
              </>
            ) : null}
          </div>
        ) : null}

        {step === "profile" ? (
          <FormStack action={profileAction}>
            <input type="hidden" name="locale" value={locale} />
            <Field>
              <FieldLabel htmlFor="fullName" required>
                {t("profile.label")}
              </FieldLabel>
              <Input
                id="fullName"
                name="fullName"
                defaultValue={fullName}
                required
                maxLength={120}
                autoComplete="name"
              />
              <FieldHint>{t("profile.hint")}</FieldHint>
              {profileState.error ? (
                <FieldError>{t("saveError")}</FieldError>
              ) : null}
            </Field>
            <div className="flex justify-end">
              <Button type="submit" disabled={profilePending}>
                {profilePending ? t("saving") : t("profile.save")}
              </Button>
            </div>
          </FormStack>
        ) : null}

        {step === "representative" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("representative.detail")}
            </p>
            {effectiveChecks.representative ? (
              <p className="text-sm font-medium text-action">
                {t("representative.complete")}
              </p>
            ) : (
              <Link
                href="/settings/account#representative"
                className={cn(buttonVariants())}
              >
                {t("representative.cta")}
              </Link>
            )}
          </div>
        ) : null}

        {step === "hours" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("hours.detail")}</p>
            {effectiveChecks.hours ? (
              <p className="text-sm font-medium text-action">
                {t("hours.complete")}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={applyHours} disabled={pending}>
                  {t("hours.preset")}
                </Button>
                <Link
                  href="/settings/calendar#hours"
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  {t("hours.custom")}
                </Link>
              </div>
            )}
          </div>
        ) : null}

        {step === "calendar" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("connectLater")}</p>
            <StaffCalendarIntegrations
              locale={locale}
              googleConfigured={googleConfigured}
              googleConnection={googleConnection}
              microsoftConfigured={microsoftConfigured}
              microsoftConnection={microsoftConnection}
              calendarProvider={calendarProvider}
            />
          </div>
        ) : null}

        {step === "meeting" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("connectLater")}</p>
            <StaffMeetingIntegrations
              locale={locale}
              googleConfigured={googleConfigured}
              googleConnection={googleConnection}
              microsoftConfigured={microsoftConfigured}
              microsoftConnection={microsoftConnection}
              zoomConfigured={zoomConfigured}
              zoomConnection={zoomConnection}
              meetingProvider={meetingProvider}
            />
          </div>
        ) : null}

        {step === "service" ? (
          <FormStack action={serviceAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="isActive" value="on" />
            <ServiceTitleField
              locale={locale}
              label={t("service.titleLabel")}
              hint={t("service.titleHint")}
            />
            <FieldGrid>
              <Field>
                <FieldLabel htmlFor="durationMinutes" required>
                  {t("service.duration")}
                </FieldLabel>
                <Input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  defaultValue={30}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="price">{t("service.price")}</FieldLabel>
                <Input
                  id="price"
                  name="price"
                  inputMode="decimal"
                  defaultValue="0"
                />
                <FieldHint>{t("service.priceHint")}</FieldHint>
              </Field>
            </FieldGrid>
            {serviceState.error ? (
              <FieldError>{t("saveError")}</FieldError>
            ) : null}
            {serviceState.message === "created" ? (
              <p className="text-sm font-medium text-action">
                {t("service.created")}
              </p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={servicePending}>
                {servicePending ? t("saving") : t("service.save")}
              </Button>
            </div>
          </FormStack>
        ) : null}

        {step === "payments" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{t("payments.detail")}</p>
            <Link href="/settings/payments" className={cn(buttonVariants())}>
              {t("payments.cta")}
            </Link>
          </div>
        ) : null}

        {step === "team" ? (
          <FormStack action={inviteAction}>
            <input type="hidden" name="locale" value={locale} />
            <FieldGrid>
              <Field>
                <FieldLabel htmlFor="inviteEmail" required>
                  {t("team.email")}
                </FieldLabel>
                <Input
                  id="inviteEmail"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="inviteRole">{t("team.role")}</FieldLabel>
                <NativeSelect
                  id="inviteRole"
                  name="access"
                  defaultValue="case_manager"
                >
                  <option value="case_manager">{tRoles("case_manager")}</option>
                  <option value="admin">{tRoles("admin")}</option>
                  <option value="unlicensed">{tRoles("unlicensed")}</option>
                </NativeSelect>
              </Field>
            </FieldGrid>
            {inviteState.error ? (
              <FieldError>{t("saveError")}</FieldError>
            ) : null}
            {inviteState.message ? (
              <p className="text-sm font-medium text-action">{t("team.sent")}</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" disabled={invitePending}>
                {invitePending ? t("saving") : t("team.send")}
              </Button>
            </div>
          </FormStack>
        ) : null}

        {step === "done" ? (
          <div className="space-y-4">
            <ul className="space-y-2 text-sm">
              <DoneRow ok={effectiveChecks.account} label={t("done.profile")} />
              <DoneRow
                ok={effectiveChecks.representative}
                label={t("done.representative")}
              />
              <DoneRow ok={effectiveChecks.hours} label={t("done.hours")} />
              <DoneRow ok={effectiveChecks.calendar} label={t("done.calendar")} />
              <DoneRow ok={effectiveChecks.meeting} label={t("done.meeting")} />
              {isAdmin ? (
                <DoneRow ok={effectiveChecks.service} label={t("done.service")} />
              ) : null}
            </ul>
            <p className="text-sm text-muted-foreground">{t("done.next")}</p>
          </div>
        ) : null}
      </SurfaceCard>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={goBack}
          disabled={index === 0 || pending}
        >
          {t("back")}
        </Button>
        <div className="flex flex-wrap gap-2">
          {step !== "done" && step !== "tour" && step !== "profile" ? (
            <Button
              type="button"
              variant="ghost"
              onClick={goNext}
              disabled={pending}
            >
              {isIntegrationCheckId(step) ? t("skipForNow") : t("skipStep")}
            </Button>
          ) : null}
          {step === "done" ? (
            <Button type="button" onClick={finish} disabled={pending}>
              {t("finish")}
            </Button>
          ) : (
            <Button type="button" onClick={goNext} disabled={pending}>
              {t("continue")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof FolderKanban;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-canvas/60 p-4">
      <Icon className="mb-2 size-5 text-action" aria-hidden />
      <p className="font-heading text-sm font-semibold text-brand">{title}</p>
      <p className="mt-1 text-pretty text-xs text-muted-foreground">{body}</p>
    </div>
  );
}

function DoneRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check
        className={cn(
          "size-4",
          ok ? "text-action" : "text-muted-foreground/40",
        )}
        aria-hidden
      />
      <span className={ok ? "text-brand" : "text-muted-foreground"}>{label}</span>
    </li>
  );
}

function ServiceTitleField({
  locale,
  label,
  hint,
}: {
  locale: AppLocale;
  label: string;
  hint: string;
}) {
  const [title, setTitle] = useState("");
  const value = useMemo(
    () =>
      JSON.stringify({
        en: { title, description: "" },
        fr: { title, description: "" },
        es: { title, description: "" },
        [locale]: { title, description: "" },
      }),
    [locale, title],
  );

  return (
    <Field>
      <FieldLabel htmlFor="serviceTitle" required>
        {label}
      </FieldLabel>
      <Input
        id="serviceTitle"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        required
      />
      <input type="hidden" name="translations" value={value} />
      <FieldHint>{hint}</FieldHint>
    </Field>
  );
}
