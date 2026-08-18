"use client";

import { useActionState, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  completePortalGoogleAction,
  forgotPortalPasswordAction,
  identifyPortalAction,
  loginPortalAction,
  setPortalPasswordAction,
} from "@/app/actions/portal-auth";
import { portalAuthInitialState } from "@/app/actions/portal-state";
import { LegalConsentFields } from "@/components/legal/legal-consent-fields";
import {
  PortalAuthDivider,
  PortalGoogleSignInButton,
} from "@/components/portal/portal-google-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  FormStack,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PasswordInput } from "@/components/ui/password-input";
import { Link } from "@/i18n/navigation";
import { PORTAL_LEGAL_ACCEPT_COOKIE } from "@/lib/legal/acceptance";
import type { PortalAccessState } from "@/lib/portal/session";
import { cn } from "@/lib/utils";

type GateView =
  | "identify"
  | "choose_org"
  | "google_choose_org"
  | "google_legal"
  | Exclude<PortalAccessState, "authenticated">;

export function PortalLoginGate({
  locale,
  mode,
  token,
  organizationName,
  initialError,
  googleLoginAvailable = false,
  googleLoginForOrg = false,
  googleStep,
  googleOrganizations,
  googlePersonId,
  googleOrganizationId,
  legalAccepted = false,
}: {
  locale: string;
  mode: Exclude<PortalAccessState, "authenticated">;
  token?: string;
  organizationName?: string;
  initialError?: string;
  googleLoginAvailable?: boolean;
  googleLoginForOrg?: boolean;
  googleStep?: "choose_org" | "needs_legal";
  googleOrganizations?: { personId: string; organizationId: string; label: string }[];
  googlePersonId?: string;
  googleOrganizationId?: string;
  legalAccepted?: boolean;
}) {
  const t = useTranslations("portal");
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [orgGoogle, setOrgGoogle] = useState(googleLoginForOrg);
  const [hasLegalAcceptance, setHasLegalAcceptance] = useState(legalAccepted);
  const [view, setView] = useState<GateView>(
    googleStep === "choose_org"
      ? "google_choose_org"
      : googleStep === "needs_legal"
        ? "google_legal"
        : token
          ? mode
          : "identify",
  );
  const [email, setEmail] = useState("");
  const [personId, setPersonId] = useState(
    googlePersonId ?? googleOrganizations?.[0]?.personId ?? "",
  );
  const [organizationId, setOrganizationId] = useState(
    googleOrganizationId ?? googleOrganizations?.[0]?.organizationId ?? "",
  );
  const [orgName, setOrgName] = useState(organizationName ?? "");
  const [accountKey, setAccountKey] = useState(() => {
    const first = googleOrganizations?.[0];
    return first ? `${first.personId}:${first.organizationId}` : "";
  });

  const [identifyState, identifyAction, identifyPending] = useActionState(
    identifyPortalAction,
    portalAuthInitialState,
  );
  const [setupState, setupAction, setupPending] = useActionState(
    setPortalPasswordAction,
    portalAuthInitialState,
  );
  const [loginState, loginAction, loginPending] = useActionState(
    loginPortalAction,
    portalAuthInitialState,
  );
  const [forgotState, forgotAction, forgotPending] = useActionState(
    forgotPortalPasswordAction,
    portalAuthInitialState,
  );

  const [googleState, googleAction, googlePending] = useActionState(
    completePortalGoogleAction,
    portalAuthInitialState,
  );

  const activeState =
    view === "identify" || view === "choose_org"
      ? identifyState
      : view === "google_choose_org" || view === "google_legal"
        ? googleState
        : view === "needs_password_setup"
          ? setupState
          : loginState;
  const rawError = activeState.error ?? forgotState.error ?? initialError;
  const errorKey =
    (rawError === "needs_setup" && view === "needs_password_setup") ||
    (rawError === "already_set" && view === "needs_password_login")
      ? null
      : rawError;
  const errorMessage = errorKey
    ? {
        invalid: t("errors.invalid"),
        mismatch: t("errors.mismatch"),
        weak_password: t("errors.weakPassword"),
        wrong_password: t("errors.wrongPassword"),
        rate_limited: t("errors.rateLimited"),
        already_set: t("errors.alreadySet"),
        needs_setup: t("errors.needsSetup"),
        no_email: t("errors.noEmail"),
        email_not_configured: t("errors.emailNotConfigured"),
        send_failed: t("errors.sendFailed"),
        legal_required: t("errors.legalRequired"),
        server_config: t("errors.serverConfig"),
        google: t("errors.google"),
        generic: t("errors.generic"),
      }[errorKey] ?? t("errors.generic")
    : null;

  useEffect(() => {
    setView(
      googleStep === "choose_org"
        ? "google_choose_org"
        : googleStep === "needs_legal"
          ? "google_legal"
          : token
            ? mode
            : "identify",
    );
    setOrgName(organizationName ?? "");
    setOrgGoogle(googleLoginForOrg);
    setHasLegalAcceptance(legalAccepted);
  }, [mode, token, organizationName, googleStep, googleLoginForOrg, legalAccepted]);

  useEffect(() => {
    if (identifyState.message === "choose_org") {
      setView("choose_org");
      const first = identifyState.organizations?.[0];
      if (first) {
        setAccountKey(`${first.personId}:${first.organizationId}`);
        setPersonId(first.personId);
        setOrganizationId(first.organizationId);
      }
    }
    if (identifyState.message === "needs_setup") {
      setView("needs_password_setup");
      setPersonId(identifyState.personId ?? "");
      setOrganizationId(identifyState.organizationId ?? "");
      setOrgName(identifyState.organizationName ?? "");
      setOrgGoogle(identifyState.googleLoginEnabled === true);
      setHasLegalAcceptance(identifyState.legalAccepted === true);
    }
    if (identifyState.message === "needs_login") {
      setView("needs_password_login");
      setPersonId(identifyState.personId ?? "");
      setOrganizationId(identifyState.organizationId ?? "");
      setOrgName(identifyState.organizationName ?? "");
      setOrgGoogle(identifyState.googleLoginEnabled === true);
      setHasLegalAcceptance(identifyState.legalAccepted === true);
    }
  }, [identifyState]);

  useEffect(() => {
    if (loginState.error === "needs_setup") {
      setView("needs_password_setup");
    }
  }, [loginState.error]);

  useEffect(() => {
    if (setupState.error === "already_set") {
      setView("needs_password_login");
    }
  }, [setupState.error]);

  useEffect(() => {
    if (googleState.message === "google_choose_org") {
      setView("google_choose_org");
      const first = googleState.organizations?.[0];
      if (first) {
        setAccountKey(`${first.personId}:${first.organizationId}`);
        setPersonId(first.personId);
        setOrganizationId(first.organizationId);
      }
    }
    if (googleState.message === "google_legal") {
      setView("google_legal");
      setPersonId(googleState.personId ?? "");
      setOrganizationId(googleState.organizationId ?? "");
      setOrgName(googleState.organizationName ?? "");
    }
  }, [googleState]);

  useEffect(() => {
    if (
      setupState.message === "authenticated" ||
      loginState.message === "authenticated" ||
      googleState.message === "authenticated"
    ) {
      window.location.replace(`/${locale}/portal/home`);
    }
  }, [setupState.message, loginState.message, googleState.message, locale]);

  const identityFields = (
    <>
      {token ? <input type="hidden" name="token" value={token} /> : null}
      <input type="hidden" name="locale" value={locale} />
      {email ? <input type="hidden" name="email" value={email} /> : null}
      {personId ? <input type="hidden" name="personId" value={personId} /> : null}
      {organizationId ? (
        <input type="hidden" name="organizationId" value={organizationId} />
      ) : null}
    </>
  );

  const legalReady = privacyAccepted && termsAccepted;
  const googleNeedsNotices = !hasLegalAcceptance;

  function markPortalLegalForOAuth() {
    document.cookie = `${PORTAL_LEGAL_ACCEPT_COOKIE}=1; Path=/; Max-Age=600; SameSite=Lax`;
  }

  function renderGoogleButton({ showNotices = googleNeedsNotices } = {}) {
    return (
      <>
        {showNotices ? (
          <LegalConsentFields
            privacyChecked={privacyAccepted}
            termsChecked={termsAccepted}
            onPrivacyChange={setPrivacyAccepted}
            onTermsChange={setTermsAccepted}
          />
        ) : null}
        <PortalGoogleSignInButton
          locale={locale}
          email={email || undefined}
          personId={personId || undefined}
          organizationId={organizationId || undefined}
          token={token}
          disabled={googleNeedsNotices && !legalReady}
          onBeforeRedirect={
            googleNeedsNotices && legalReady ? markPortalLegalForOAuth : undefined
          }
        />
      </>
    );
  }

  if (forgotState.message === "email_sent") {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("forgotSuccessTitle")}
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {t("forgotSuccessBody")}
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-16">
      <header className="space-y-2 text-center">
        <h1 className="font-heading text-2xl font-semibold text-brand">
          {t("title")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {orgName ? t("subtitleOrg", { org: orgName }) : t("subtitle")}
        </p>
      </header>

      <div className="space-y-4 rounded-xl border border-border bg-surface p-5 shadow-elevated">
        {view === "identify" || view === "choose_org" ? (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {view === "choose_org" ? t("chooseOrgTitle") : t("loginTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {view === "choose_org" ? t("chooseOrgBody") : t("loginBody")}
              </p>
            </div>
            {view === "identify" && googleLoginAvailable ? (
              <>
                {renderGoogleButton()}
                <PortalAuthDivider label={t("orEmail")} />
              </>
            ) : null}
            <FormStack
              action={identifyAction}
              onSubmit={(event) => {
                const value = String(
                  new FormData(event.currentTarget).get("email") || "",
                );
                if (value) setEmail(value);
              }}
            >
              <input type="hidden" name="locale" value={locale} />
              {view === "choose_org" ? (
                <>
                  <input type="hidden" name="email" value={email} />
                  <Field>
                    <FieldLabel htmlFor="portal-account" required>
                      {t("account")}
                    </FieldLabel>
                    <NativeSelect
                      id="portal-account"
                      name="account"
                      required
                      value={accountKey}
                      onChange={(event) => {
                        const value = event.target.value;
                        setAccountKey(value);
                        const [nextPerson, nextOrg] = value.split(":");
                        setPersonId(nextPerson ?? "");
                        setOrganizationId(nextOrg ?? "");
                      }}
                    >
                      {(identifyState.organizations ?? []).map((org) => {
                        const value = `${org.personId}:${org.organizationId}`;
                        return (
                          <option key={value} value={value}>
                            {org.label}
                          </option>
                        );
                      })}
                    </NativeSelect>
                  </Field>
                  <input type="hidden" name="personId" value={personId} />
                  <input
                    type="hidden"
                    name="organizationId"
                    value={organizationId}
                  />
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="portal-email" required>
                    {t("email")}
                  </FieldLabel>
                  <Input
                    id="portal-email"
                    name="email"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                  <FieldHint>{t("emailHint")}</FieldHint>
                </Field>
              )}
              <Button type="submit" className="w-full" disabled={identifyPending}>
                {identifyPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {identifyPending ? t("continuing") : t("continueCta")}
              </Button>
            </FormStack>
            {view === "choose_org" ? (
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: "link", size: "sm" }),
                  "h-auto p-0 text-action",
                )}
                onClick={() => {
                  setView("identify");
                  setPersonId("");
                  setOrganizationId("");
                  setAccountKey("");
                }}
              >
                {t("useAnotherEmail")}
              </button>
            ) : null}
          </>
        ) : view === "google_choose_org" ? (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("chooseOrgTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("chooseOrgBody")}</p>
            </div>
            <FormStack action={googleAction}>
              <Field>
                <FieldLabel htmlFor="portal-google-account" required>
                  {t("account")}
                </FieldLabel>
                <NativeSelect
                  id="portal-google-account"
                  name="account"
                  required
                  value={accountKey}
                  onChange={(event) => {
                    const value = event.target.value;
                    setAccountKey(value);
                    const [nextPerson, nextOrg] = value.split(":");
                    setPersonId(nextPerson ?? "");
                    setOrganizationId(nextOrg ?? "");
                  }}
                >
                  {(googleState.organizations ?? googleOrganizations ?? []).map(
                    (org) => {
                      const value = `${org.personId}:${org.organizationId}`;
                      return (
                        <option key={value} value={value}>
                          {org.label}
                        </option>
                      );
                    },
                  )}
                </NativeSelect>
              </Field>
              <input type="hidden" name="personId" value={personId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <Button type="submit" className="w-full" disabled={googlePending}>
                {googlePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {googlePending ? t("continuing") : t("continueCta")}
              </Button>
            </FormStack>
          </>
        ) : view === "google_legal" ? (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("googleLegalTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("googleLegalBody")}</p>
            </div>
            <FormStack action={googleAction}>
              <input type="hidden" name="personId" value={personId} />
              <input type="hidden" name="organizationId" value={organizationId} />
              <LegalConsentFields
                privacyChecked={privacyAccepted}
                termsChecked={termsAccepted}
                onPrivacyChange={setPrivacyAccepted}
                onTermsChange={setTermsAccepted}
                disabled={googlePending}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={googlePending || !privacyAccepted || !termsAccepted}
              >
                {googlePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {googlePending ? t("continuing") : t("continueCta")}
              </Button>
            </FormStack>
          </>
        ) : view === "needs_password_setup" ? (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("setupTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("setupBody")}</p>
              <p className="text-xs text-muted-foreground">{t("passwordRules")}</p>
            </div>
            {orgGoogle && googleLoginAvailable ? (
              <>
                {renderGoogleButton()}
                <PortalAuthDivider label={t("orPassword")} />
              </>
            ) : null}
            <FormStack action={setupAction}>
              {identityFields}
              <Field>
                <FieldLabel htmlFor="portal-password" required>
                  {t("password")}
                </FieldLabel>
                <PasswordInput
                  id="portal-password"
                  name="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="portal-confirm" required>
                  {t("confirm")}
                </FieldLabel>
                <PasswordInput
                  id="portal-confirm"
                  name="confirm"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                />
              </Field>
              {orgGoogle && googleLoginAvailable ? (
                <>
                  {privacyAccepted ? (
                    <input type="hidden" name="privacyAccepted" value="on" />
                  ) : null}
                  {termsAccepted ? (
                    <input type="hidden" name="termsAccepted" value="on" />
                  ) : null}
                </>
              ) : (
                <LegalConsentFields
                  privacyChecked={privacyAccepted}
                  termsChecked={termsAccepted}
                  onPrivacyChange={setPrivacyAccepted}
                  onTermsChange={setTermsAccepted}
                  disabled={setupPending}
                />
              )}
              <Button
                type="submit"
                className="w-full"
                disabled={setupPending || !privacyAccepted || !termsAccepted}
              >
                {setupPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {setupPending ? t("settingUp") : t("setupCta")}
              </Button>
            </FormStack>
          </>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="font-heading text-lg font-semibold text-brand">
                {t("loginTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">{t("signInBody")}</p>
            </div>
            {orgGoogle && googleLoginAvailable ? (
              <>
                {renderGoogleButton()}
                <PortalAuthDivider label={t("orPassword")} />
              </>
            ) : null}
            <FormStack action={loginAction}>
              {identityFields}
              <Field>
                <FieldLabel htmlFor="portal-login-password" required>
                  {t("password")}
                </FieldLabel>
                <PasswordInput
                  id="portal-login-password"
                  name="password"
                  autoComplete="current-password"
                  required
                  showLabel={t("showPassword")}
                  hideLabel={t("hidePassword")}
                />
              </Field>
              <Button type="submit" className="w-full" disabled={loginPending}>
                {loginPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                {loginPending ? t("loggingIn") : t("loginCta")}
              </Button>
            </FormStack>
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-sm text-muted-foreground">{t("forgotBody")}</p>
              <FormStack action={forgotAction}>
                {identityFields}
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full"
                  disabled={forgotPending}
                >
                  {forgotPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  {forgotPending ? t("forgotSending") : t("forgotCta")}
                </Button>
              </FormStack>
            </div>
            {!token ? (
              <button
                type="button"
                className={cn(
                  buttonVariants({ variant: "link", size: "sm" }),
                  "h-auto p-0 text-action",
                )}
                onClick={() => {
                  setView("identify");
                  setPersonId("");
                  setOrganizationId("");
                }}
              >
                {t("useAnotherEmail")}
              </button>
            ) : null}
          </>
        )}

        {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        <Link
          href="/privacy"
          className={cn(buttonVariants({ variant: "link", size: "sm" }), "h-auto p-0")}
        >
          {t("privacy")}
        </Link>
      </p>
    </div>
  );
}
