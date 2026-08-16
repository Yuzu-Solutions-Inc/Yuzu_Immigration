"use client";

import { Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createServiceAutomationAction,
  deleteServiceAutomationAction,
  toggleServiceAutomationAction,
  updateServiceAutomationAction,
  type AutomationActionState,
} from "@/app/actions/service-automations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type {
  BookingFormFieldRow,
  BookingServiceRow,
  ServiceEmailAutomationRow,
} from "@/lib/booking/types";
import { serviceTitle } from "@/lib/booking/service-i18n";
import {
  AUTOMATION_VARIABLES,
  CONSULTANT_EMAIL_TOKEN,
  CUSTOMER_EMAIL_TOKEN,
  parseAutomationTranslations,
} from "@/lib/email/automation-template";
import {
  APP_LOCALES,
  LOCALE_LABELS,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/locales";

const initialState: AutomationActionState = {};

const EMPTY_COPY = { subject: "", body: "" };

const DEFAULT_COPY: Record<AppLocale, { subject: string; body: string }> = {
  en: {
    subject: "Reminder: {{service_name}} on {{date}}",
    body: `Hi {{customer_name}},

This is a reminder of your {{service_name}} with {{consultant_name}} on {{datetime}} ({{timezone}}).

{{meet_link}}`,
  },
  fr: {
    subject: "Rappel : {{service_name}} le {{date}}",
    body: `Bonjour {{customer_name}},

Ceci est un rappel de votre {{service_name}} avec {{consultant_name}} le {{datetime}} ({{timezone}}).

{{meet_link}}`,
  },
  es: {
    subject: "Recordatorio: {{service_name}} el {{date}}",
    body: `Hola {{customer_name}},

Este es un recordatorio de su {{service_name}} con {{consultant_name}} el {{datetime}} ({{timezone}}).

{{meet_link}}`,
  },
};

function emptyCopies(): Record<AppLocale, { subject: string; body: string }> {
  return {
    en: { ...EMPTY_COPY },
    fr: { ...EMPTY_COPY },
    es: { ...EMPTY_COPY },
  };
}

function initialCopies(
  automation: ServiceEmailAutomationRow | undefined,
  orgDefaultLocale: AppLocale,
) {
  const copies = emptyCopies();
  if (!automation) {
    copies[orgDefaultLocale] = { ...DEFAULT_COPY[orgDefaultLocale] };
    return copies;
  }
  const translations = parseAutomationTranslations(automation.translations);
  let any = false;
  for (const locale of APP_LOCALES) {
    if (translations[locale]) {
      copies[locale] = { ...translations[locale]! };
      any = true;
    }
  }
  if (!any) {
    copies[orgDefaultLocale] = {
      subject: automation.subject,
      body: automation.body,
    };
  }
  return copies;
}

function extraEmailsFrom(recipients: string[]) {
  return recipients.filter(
    (item) => item !== CUSTOMER_EMAIL_TOKEN && item !== CONSULTANT_EMAIL_TOKEN,
  );
}

function insertToken(
  el: HTMLInputElement | HTMLTextAreaElement | null,
  token: string,
  value: string,
  setValue: (next: string) => void,
) {
  if (!el || typeof el.selectionStart !== "number") {
    setValue(`${value}${token}`);
    return;
  }
  const start = el.selectionStart ?? value.length;
  const end = el.selectionEnd ?? start;
  const next = value.slice(0, start) + token + value.slice(end);
  setValue(next);
  requestAnimationFrame(() => {
    el.focus();
    const pos = start + token.length;
    el.setSelectionRange(pos, pos);
  });
}

function AutomationForm({
  locale,
  orgDefaultLocale,
  services,
  formFields,
  automation,
  isEnabled,
  onCancel,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  services: BookingServiceRow[];
  formFields: BookingFormFieldRow[];
  automation?: ServiceEmailAutomationRow;
  isEnabled: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations("services");
  const subjectRefs = useRef<Partial<Record<AppLocale, HTMLInputElement | null>>>(
    {},
  );
  const bodyRefs = useRef<
    Partial<Record<AppLocale, HTMLTextAreaElement | null>>
  >({});
  const lastField = useRef<"subject" | "body">("body");
  const lastLocale = useRef<AppLocale>(orgDefaultLocale);
  const [title, setTitle] = useState(automation?.title ?? "");
  const [copies, setCopies] = useState(() =>
    initialCopies(automation, orgDefaultLocale),
  );
  const [serviceIds, setServiceIds] = useState<string[]>(
    automation?.service_ids ?? [],
  );
  const [includeCustomer, setIncludeCustomer] = useState(
    automation ? automation.recipients.includes(CUSTOMER_EMAIL_TOKEN) : true,
  );
  const [includeConsultant, setIncludeConsultant] = useState(
    automation
      ? automation.recipients.includes(CONSULTANT_EMAIL_TOKEN)
      : false,
  );
  const [extraEmails, setExtraEmails] = useState(
    extraEmailsFrom(automation?.recipients ?? []),
  );
  const [extraDraft, setExtraDraft] = useState("");
  const [includeDoNotReply, setIncludeDoNotReply] = useState(
    automation?.include_do_not_reply ?? true,
  );
  const action = automation
    ? updateServiceAutomationAction
    : createServiceAutomationAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (state.message === "created" || state.message === "saved") {
      toast.success(
        t(state.message === "created" ? "automationCreated" : "automationSaved"),
      );
      onCancel();
    }
    if (state.error) toast.error(t(`errors.${state.error}`));
    // Close/toast only when the action result changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const recipients = [
    ...(includeCustomer ? [CUSTOMER_EMAIL_TOKEN] : []),
    ...(includeConsultant ? [CONSULTANT_EMAIL_TOKEN] : []),
    ...extraEmails,
  ];

  const extraVariables = useMemo(() => {
    const formIds = new Set(
      services
        .filter((service) => serviceIds.includes(service.id) && service.form_id)
        .map((service) => service.form_id as string),
    );
    const seen = new Set<string>();
    const fields: BookingFormFieldRow[] = [];
    for (const field of formFields) {
      if (!formIds.has(field.form_id) || seen.has(field.field_key)) continue;
      seen.add(field.field_key);
      fields.push(field);
    }
    return fields;
  }, [formFields, serviceIds, services]);

  function addExtra() {
    const email = extraDraft.trim().toLowerCase();
    if (!email || extraEmails.includes(email) || recipients.includes(email)) {
      return;
    }
    setExtraEmails((prev) => [...prev, email]);
    setExtraDraft("");
  }

  function insertVariable(name: string) {
    const token = `{{${name}}}`;
    const activeLocale = lastLocale.current;
    const copy = copies[activeLocale];
    if (lastField.current === "subject") {
      insertToken(
        subjectRefs.current[activeLocale] ?? null,
        token,
        copy.subject,
        (next) =>
          setCopies((prev) => ({
            ...prev,
            [activeLocale]: { ...prev[activeLocale], subject: next },
          })),
      );
    } else {
      insertToken(
        bodyRefs.current[activeLocale] ?? null,
        token,
        copy.body,
        (next) =>
          setCopies((prev) => ({
            ...prev,
            [activeLocale]: { ...prev[activeLocale], body: next },
          })),
      );
    }
  }

  const defaultCopyReady =
    copies[orgDefaultLocale].subject.trim().length > 0 &&
    copies[orgDefaultLocale].body.trim().length > 0;

  return (
    <form action={formAction} className="min-w-0 space-y-5">
      <input type="hidden" name="locale" value={locale} />
      {automation ? (
        <input type="hidden" name="automationId" value={automation.id} />
      ) : null}
      <input type="hidden" name="recipients" value={JSON.stringify(recipients)} />
      <input type="hidden" name="serviceIds" value={JSON.stringify(serviceIds)} />
      <input
        type="hidden"
        name="translations"
        value={JSON.stringify(copies)}
      />
      <input type="hidden" name="isEnabled" value={isEnabled ? "on" : ""} />
      <input
        type="hidden"
        name="includeDoNotReply"
        value={includeDoNotReply ? "on" : ""}
      />

      <Field>
        <FieldLabel htmlFor="automation-title" required>
          {t("automationTitle")}
        </FieldLabel>
        <Input
          id="automation-title"
          name="title"
          required
          maxLength={80}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-brand">
            {t("automationServices")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("automationAssignHelp")}
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((service) => {
            const checked = serviceIds.includes(service.id);
            return (
              <label
                key={service.id}
                className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setServiceIds((prev) => [...prev, service.id]);
                    } else {
                      setServiceIds((prev) =>
                        prev.filter((id) => id !== service.id),
                      );
                    }
                  }}
                  className="mt-0.5 size-4 shrink-0 rounded border-input"
                />
                <span className="min-w-0 truncate font-medium">
                  {serviceTitle(service, locale, orgDefaultLocale)}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <h3 className="text-sm font-semibold text-brand">
          {t("automationScheduleSection")}
        </h3>
        <Field className="max-w-sm">
          <FieldLabel htmlFor="daysBefore" required>
            {t("automationDaysBefore")}
          </FieldLabel>
          <Input
            id="daysBefore"
            name="daysBefore"
            placeholder={t("automationDaysPlaceholder")}
            defaultValue={(automation?.days_before ?? [1]).join(", ")}
            required
          />
          <FieldHint>{t("automationDaysHint")}</FieldHint>
        </Field>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <div>
          <h3 className="text-sm font-semibold text-brand">
            {t("automationCopy")}
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("automationCopyHelp", {
              language: LOCALE_LABELS[orgDefaultLocale],
            })}
          </p>
        </div>
        <Tabs
          defaultValue={orgDefaultLocale}
          onValueChange={(value) => {
            if (isAppLocale(String(value))) lastLocale.current = value;
          }}
        >
          <TabsList variant="line" className="w-full">
            {APP_LOCALES.map((code) => (
              <TabsTrigger key={code} value={code}>
                {LOCALE_LABELS[code]}
                {code === orgDefaultLocale ? (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    {t("automationDefaultLang")}
                  </span>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {APP_LOCALES.map((code) => (
            <TabsContent
              key={code}
              value={code}
              keepMounted
              className="space-y-3 pt-3"
            >
              <Field>
                <FieldLabel
                  htmlFor={`automation-subject-${code}`}
                  required={code === orgDefaultLocale}
                >
                  {t("automationSubject")}
                </FieldLabel>
                <Input
                  ref={(el) => {
                    subjectRefs.current[code] = el;
                  }}
                  id={`automation-subject-${code}`}
                  maxLength={200}
                  value={copies[code].subject}
                  onChange={(event) =>
                    setCopies((prev) => ({
                      ...prev,
                      [code]: { ...prev[code], subject: event.target.value },
                    }))
                  }
                  onFocus={() => {
                    lastField.current = "subject";
                    lastLocale.current = code;
                  }}
                />
              </Field>
              <Field>
                <FieldLabel
                  htmlFor={`automation-body-${code}`}
                  required={code === orgDefaultLocale}
                >
                  {t("automationBody")}
                </FieldLabel>
                <Textarea
                  ref={(el) => {
                    bodyRefs.current[code] = el;
                  }}
                  id={`automation-body-${code}`}
                  rows={8}
                  maxLength={8000}
                  value={copies[code].body}
                  onChange={(event) =>
                    setCopies((prev) => ({
                      ...prev,
                      [code]: { ...prev[code], body: event.target.value },
                    }))
                  }
                  onFocus={() => {
                    lastField.current = "body";
                    lastLocale.current = code;
                  }}
                />
              </Field>
            </TabsContent>
          ))}
        </Tabs>
        <div className="space-y-2 border-t border-border/80 pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("automationVariables")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AUTOMATION_VARIABLES.map((name) => (
              <button
                key={name}
                type="button"
                className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40"
                onClick={() => insertVariable(name)}
              >
                {t(`variables.${name}`)}
              </button>
            ))}
            {extraVariables.map((field) => (
              <button
                key={field.id}
                type="button"
                className="rounded-full border border-action/30 bg-action/5 px-2.5 py-1 text-xs font-medium text-brand hover:border-action/40"
                onClick={() => insertVariable(field.field_key)}
              >
                {field.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <h3 className="text-sm font-semibold text-brand">
          {t("automationRecipients")}
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <Label htmlFor="recipient-customer" className="text-sm font-medium">
              {t("recipientCustomer")}
            </Label>
            <Switch
              id="recipient-customer"
              checked={includeCustomer}
              onCheckedChange={setIncludeCustomer}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <Label
              htmlFor="recipient-consultant"
              className="text-sm font-medium"
            >
              {t("recipientConsultant")}
            </Label>
            <Switch
              id="recipient-consultant"
              checked={includeConsultant}
              onCheckedChange={setIncludeConsultant}
            />
          </div>
        </div>
        <div className="flex min-w-0 gap-2">
          <Input
            id="recipient-extra"
            type="email"
            value={extraDraft}
            onChange={(event) => setExtraDraft(event.target.value)}
            placeholder={t("recipientExtraPlaceholder")}
            className="min-w-0"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addExtra();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addExtra}>
            {t("recipientAdd")}
          </Button>
        </div>
        {extraEmails.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {extraEmails.map((email) => (
              <li
                key={email}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-surface py-1 pr-1 pl-2.5 text-xs text-brand"
              >
                <span className="truncate">{email}</span>
                <button
                  type="button"
                  className="rounded-full p-1 text-muted-foreground hover:bg-canvas hover:text-destructive"
                  aria-label={t("recipientRemove")}
                  onClick={() =>
                    setExtraEmails((prev) => prev.filter((item) => item !== email))
                  }
                >
                  <Trash2 className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4">
        <h3 className="text-sm font-semibold text-brand">
          {t("automationOptionsSection")}
        </h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <Label htmlFor="automation-do-not-reply" className="text-sm font-medium">
                {t("automationDoNotReply")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t("automationDoNotReplyHelp")}
              </p>
            </div>
            <Switch
              id="automation-do-not-reply"
              checked={includeDoNotReply}
              onCheckedChange={setIncludeDoNotReply}
            />
          </div>
        </div>
      </section>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("automationBack")}
        </Button>
        <Button
          type="submit"
          disabled={
            pending ||
            recipients.length === 0 ||
            serviceIds.length === 0 ||
            !defaultCopyReady
          }
        >
          {pending ? t("saving") : automation ? t("save") : t("automationCreate")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ServiceEmailAutomationsButton({
  locale,
  orgDefaultLocale,
  services,
  formFields,
  automations,
  canManage,
}: {
  locale: string;
  orgDefaultLocale: AppLocale;
  services: BookingServiceRow[];
  formFields: BookingFormFieldRow[];
  automations: ServiceEmailAutomationRow[];
  canManage: boolean;
}) {
  const t = useTranslations("services");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEmailAutomationRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [formEnabled, setFormEnabled] = useState(true);
  const serviceTitleById = useMemo(
    () =>
      new Map(
        services.map((service) => [
          service.id,
          serviceTitle(service, locale, orgDefaultLocale),
        ]),
      ),
    [locale, orgDefaultLocale, services],
  );

  function closeForm() {
    setCreating(false);
    setEditing(null);
    setFormEnabled(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          closeForm();
          setOpen(true);
        }}
      >
        <Mail className="size-4" />
        {t("automations")}
        {automations.length > 0 ? ` (${automations.length})` : ""}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) closeForm();
        }}
      >
        <DialogContent
          className="flex max-h-[90vh] w-full flex-col overflow-hidden sm:max-w-4xl"
          showCloseButton
        >
          <DialogHeader>
            <div className="flex items-start justify-between gap-4 pr-8">
              <div className="min-w-0 space-y-2">
                <DialogTitle>
                  {creating || editing
                    ? editing
                      ? t("editAutomationTitle")
                      : t("newAutomationTitle")
                    : t("automationsTitle")}
                </DialogTitle>
                <DialogDescription>
                  {creating || editing
                    ? t("automationFormSubtitle")
                    : t("automationsListSubtitle")}
                </DialogDescription>
              </div>
              {creating || editing ? (
                <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-surface px-3.5 py-2.5">
                  <Label
                    htmlFor="automation-enabled-header"
                    className="text-sm font-semibold text-brand"
                  >
                    {t("automationActive")}
                  </Label>
                  <Switch
                    id="automation-enabled-header"
                    checked={formEnabled}
                    onCheckedChange={setFormEnabled}
                    className="h-7 w-12 shrink-0 data-[size=default]:h-7 data-[size=default]:w-12 [&_[data-slot=switch-thumb]]:size-5 [&_[data-slot=switch-thumb]]:data-checked:translate-x-5"
                  />
                </div>
              ) : null}
            </div>
          </DialogHeader>

          <div className="min-h-0 overflow-x-hidden overflow-y-auto pr-1">
            {creating || editing ? (
              <AutomationForm
                locale={locale}
                orgDefaultLocale={orgDefaultLocale}
                services={services}
                formFields={formFields}
                automation={editing ?? undefined}
                isEnabled={formEnabled}
                onCancel={closeForm}
              />
            ) : (
              <div className="space-y-4">
                {automations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("automationsEmpty")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {automations.map((automation) => {
                      const names = automation.service_ids
                        .map((id) => serviceTitleById.get(id))
                        .filter(Boolean);
                      return (
                        <li
                          key={automation.id}
                          className="rounded-xl border border-border px-3 py-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-brand">
                                {automation.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {names.length === 0
                                  ? t("noneAssigned")
                                  : names.join(", ")}
                                {" · "}
                                {t("automationSummary", {
                                  days:
                                    automation.days_before.join(", ") || "—",
                                  count: automation.recipients.length,
                                })}
                              </p>
                            </div>
                            {canManage ? (
                              <div className="flex shrink-0 items-center gap-1">
                                <Switch
                                  checked={automation.is_enabled}
                                  aria-label={
                                    automation.is_enabled
                                      ? t("automationActive")
                                      : t("automationPaused")
                                  }
                                  onCheckedChange={async (checked) => {
                                    const result =
                                      await toggleServiceAutomationAction(
                                        automation.id,
                                        locale,
                                        checked,
                                      );
                                    if (result.error) {
                                      toast.error(t(`errors.${result.error}`));
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setFormEnabled(automation.is_enabled);
                                    setEditing(automation);
                                  }}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="destructive"
                                  size="sm"
                                  onClick={async () => {
                                    if (
                                      !window.confirm(t("automationDeleteConfirm"))
                                    ) {
                                      return;
                                    }
                                    const result =
                                      await deleteServiceAutomationAction(
                                        automation.id,
                                        locale,
                                      );
                                    if (result.error) {
                                      toast.error(t(`errors.${result.error}`));
                                    } else {
                                      toast.success(t("automationDeleted"));
                                    }
                                  }}
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            ) : (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                {automation.is_enabled
                                  ? t("automationActive")
                                  : t("automationPaused")}
                              </span>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {canManage ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={services.length === 0}
                    onClick={() => {
                      setEditing(null);
                      setFormEnabled(true);
                      setCreating(true);
                    }}
                  >
                    <Plus className="size-4" />
                    {t("newAutomation")}
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
