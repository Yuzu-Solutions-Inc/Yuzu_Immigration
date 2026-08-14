"use client";

import { Mail, Pencil, Plus, Trash2 } from "lucide-react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  createServiceAutomationAction,
  deleteServiceAutomationAction,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ServiceEmailAutomationRow } from "@/lib/booking/types";
import {
  AUTOMATION_VARIABLES,
  CONSULTANT_EMAIL_TOKEN,
  CUSTOMER_EMAIL_TOKEN,
} from "@/lib/email/automation-template";

const initialState: AutomationActionState = {};

const DEFAULT_SUBJECT = "Reminder: {{service_name}} on {{date}}";
const DEFAULT_BODY = `Hi {{customer_name}},

This is a reminder of your {{service_name}} with {{consultant_name}} on {{datetime}} ({{timezone}}).

{{meet_link}}`;

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
  serviceId,
  automation,
  onCancel,
}: {
  locale: string;
  serviceId: string;
  automation?: ServiceEmailAutomationRow;
  onCancel: () => void;
}) {
  const t = useTranslations("services");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<"subject" | "body">("body");
  const [subject, setSubject] = useState(
    automation?.subject ?? DEFAULT_SUBJECT,
  );
  const [body, setBody] = useState(automation?.body ?? DEFAULT_BODY);
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

  function addExtra() {
    const email = extraDraft.trim().toLowerCase();
    if (!email || extraEmails.includes(email) || recipients.includes(email)) {
      return;
    }
    setExtraEmails((prev) => [...prev, email]);
    setExtraDraft("");
  }

  function insertVariable(name: (typeof AUTOMATION_VARIABLES)[number]) {
    const token = `{{${name}}}`;
    if (lastField.current === "subject") {
      insertToken(subjectRef.current, token, subject, setSubject);
    } else {
      insertToken(bodyRef.current, token, body, setBody);
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="serviceId" value={serviceId} />
      {automation ? (
        <input type="hidden" name="automationId" value={automation.id} />
      ) : null}
      <input type="hidden" name="recipients" value={JSON.stringify(recipients)} />

      <div className="space-y-2">
        <Label htmlFor="automation-subject">{t("automationSubject")}</Label>
        <Input
          ref={subjectRef}
          id="automation-subject"
          name="subject"
          required
          maxLength={200}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          onFocus={() => {
            lastField.current = "subject";
          }}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="automation-body">{t("automationBody")}</Label>
        <Textarea
          ref={bodyRef}
          id="automation-body"
          name="body"
          required
          rows={8}
          maxLength={8000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onFocus={() => {
            lastField.current = "body";
          }}
        />
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("automationVariables")}</p>
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
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="daysBefore">{t("automationDaysBefore")}</Label>
        <Input
          id="daysBefore"
          name="daysBefore"
          type="number"
          min={0}
          max={90}
          defaultValue={automation?.days_before ?? 1}
          required
        />
        <p className="text-xs text-muted-foreground">{t("automationDaysHint")}</p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">{t("automationRecipients")}</p>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeCustomer}
            onChange={(event) => setIncludeCustomer(event.target.checked)}
            className="size-4 rounded border-input"
          />
          {t("recipientCustomer")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeConsultant}
            onChange={(event) => setIncludeConsultant(event.target.checked)}
            className="size-4 rounded border-input"
          />
          {t("recipientConsultant")}
        </label>
        <div className="flex gap-2">
          <Input
            type="email"
            value={extraDraft}
            onChange={(event) => setExtraDraft(event.target.value)}
            placeholder={t("recipientExtraPlaceholder")}
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
          <ul className="space-y-1">
            {extraEmails.map((email) => (
              <li
                key={email}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-1.5 text-sm"
              >
                <span>{email}</span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setExtraEmails((prev) => prev.filter((item) => item !== email))
                  }
                >
                  {t("recipientRemove")}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isEnabled"
          defaultChecked={automation?.is_enabled ?? true}
          className="size-4 rounded border-input"
        />
        {t("automationEnabled")}
      </label>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("automationBack")}
        </Button>
        <Button type="submit" disabled={pending || recipients.length === 0}>
          {pending ? t("saving") : automation ? t("save") : t("automationCreate")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ServiceEmailAutomationsButton({
  locale,
  serviceId,
  serviceTitle,
  automations,
  canManage,
}: {
  locale: string;
  serviceId: string;
  serviceTitle: string;
  automations: ServiceEmailAutomationRow[];
  canManage: boolean;
}) {
  const t = useTranslations("services");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ServiceEmailAutomationRow | null>(null);
  const [creating, setCreating] = useState(false);

  function closeForm() {
    setCreating(false);
    setEditing(null);
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
          className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
          showCloseButton
        >
          <DialogHeader>
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
                : t("automationsSubtitle", { service: serviceTitle })}
            </DialogDescription>
          </DialogHeader>

          {creating || editing ? (
            <AutomationForm
              locale={locale}
              serviceId={serviceId}
              automation={editing ?? undefined}
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
                  {automations.map((automation) => (
                    <li
                      key={automation.id}
                      className="rounded-xl border border-border bg-surface p-3"
                    >
                      <p className="font-medium text-brand">{automation.subject}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("automationSummary", {
                          days: automation.days_before,
                          count: automation.recipients.length,
                        })}
                        {automation.is_enabled
                          ? ""
                          : ` · ${t("automationPaused")}`}
                      </p>
                      {canManage ? (
                        <div className="mt-2 flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(automation)}
                          >
                            <Pencil className="size-4" />
                            {t("edit")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={async () => {
                              if (!window.confirm(t("automationDeleteConfirm"))) {
                                return;
                              }
                              const result = await deleteServiceAutomationAction(
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
                            {t("delete")}
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {canManage ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setCreating(true);
                  }}
                >
                  <Plus className="size-4" />
                  {t("newAutomation")}
                </Button>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
