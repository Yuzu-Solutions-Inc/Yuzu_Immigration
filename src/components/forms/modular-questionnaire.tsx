"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CANONICAL_FIELDS,
  fieldsForFormCodes,
  isFieldVisible,
  sectionsForFields,
  type CanonicalField,
  type QuestionnaireSection,
} from "@/lib/ircc/fields";

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[10px] font-semibold text-muted-foreground hover:bg-muted"
        aria-label={text}
      >
        ?
      </button>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-56 -translate-x-1/2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-normal text-brand shadow-elevated group-hover:block group-focus-within:block">
        {text}
      </span>
    </span>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  t,
  th,
}: {
  field: CanonicalField;
  value: string;
  onChange: (value: string) => void;
  t: ReturnType<typeof useTranslations>;
  th: ReturnType<typeof useTranslations>;
}) {
  const id = `field-${field.key}`;
  const label = t(`fields.${field.key}`);
  const help = field.helpKey ? th(field.helpKey) : null;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="inline-flex items-center">
        {label}
        {field.required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
        {help ? <HelpTip text={help} /> : null}
      </Label>
      {field.type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="" disabled={Boolean(value)}>
            {t("selectPlaceholder")}
          </option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(`options.${opt.labelKey}`)}
            </option>
          ))}
        </select>
      ) : field.type === "yesno" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px]"
        >
          <option value="" disabled={Boolean(value)}>
            {t("selectPlaceholder")}
          </option>
          <option value="Y">{t("options.yes")}</option>
          <option value="N">{t("options.no")}</option>
        </select>
      ) : field.type === "textarea" ? (
        <Textarea
          id={id}
          value={value}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          rows={3}
          className="rounded-xl"
        />
      ) : (
        <Input
          id={id}
          type={
            field.type === "email"
              ? "email"
              : field.type === "tel"
                ? "tel"
                : field.type === "date"
                  ? "date"
                  : "text"
          }
          value={value}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
        />
      )}
    </div>
  );
}

export type QuestionnairePerson = {
  id: string;
  displayName: string;
  role: string;
  formCodes: string[];
  answers: Record<string, unknown>;
};

function answersToState(initial: Record<string, unknown>) {
  const next: Record<string, string> = {};
  for (const field of CANONICAL_FIELDS) {
    const v = initial[field.key];
    if (v !== undefined && v !== null) next[field.key] = String(v);
  }
  next.hasRepresentative = "Y";
  return next;
}

export function ModularQuestionnaire({
  people,
  onSave,
  pending,
  statusMessage,
  errorMessage,
}: {
  people: QuestionnairePerson[];
  onSave: (
    personId: string,
    answers: Record<string, unknown>,
    section: string,
  ) => void;
  pending?: boolean;
  statusMessage?: string | null;
  errorMessage?: string | null;
}) {
  const t = useTranslations("forms");
  const th = useTranslations("forms.help");
  const tr = useTranslations("roles");

  const [activePersonId, setActivePersonId] = useState(
    () => people[0]?.id ?? "",
  );
  const activePerson =
    people.find((p) => p.id === activePersonId) ?? people[0] ?? null;

  const fields = useMemo(
    () => fieldsForFormCodes(activePerson?.formCodes ?? []),
    [activePerson?.formCodes],
  );
  const sections = useMemo(() => sectionsForFields(fields), [fields]);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    answersToState(activePerson?.answers ?? {}),
  );
  const [sectionIndex, setSectionIndex] = useState(0);

  useEffect(() => {
    if (!activePersonId) return;
    const person = people.find((p) => p.id === activePersonId);
    if (!person) return;
    setAnswers(answersToState(person.answers));
    setSectionIndex(0);
    // Reset local draft when switching people (not on every answers prop refresh).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [activePersonId]);

  const section = (sections[sectionIndex] ??
    "identity") as QuestionnaireSection;

  const sectionFields = fields.filter(
    (f) => f.section === section && isFieldVisible(f, answers),
  );

  function update(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value, hasRepresentative: "Y" }));
  }

  function save() {
    if (!activePerson) return;
    onSave(activePerson.id, { ...answers, hasRepresentative: "Y" }, section);
  }

  if (!activePerson) {
    return (
      <p className="text-sm text-muted-foreground">{t("questionnaireEmpty")}</p>
    );
  }

  return (
    <div className="space-y-6">
      {people.length > 1 ? (
        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("personTabsLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {people.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => setActivePersonId(person.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  person.id === activePerson.id
                    ? "bg-brand text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {person.displayName}
                <span className="ml-1 font-normal opacity-80">
                  · {tr(person.role as never)}
                </span>
              </button>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {t("personTabsHelp", { name: activePerson.displayName })}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          <h3 className="font-heading text-base font-semibold text-brand">
            {activePerson.displayName}
          </h3>
          <p className="text-sm text-muted-foreground">
            {t("personTabsHelp", { name: activePerson.displayName })}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {sections.map((s, i) => (
          <button
            key={s}
            type="button"
            onClick={() => setSectionIndex(i)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              i === sectionIndex
                ? "bg-action text-white"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {t(`sections.${s}`)}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <h3 className="font-heading text-lg font-semibold text-brand">
          {t(`sections.${section}`)}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(`sectionLedes.${section}`)}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sectionFields.map((field) => (
          <div
            key={field.key}
            className={
              field.type === "textarea" || field.key === "email"
                ? "sm:col-span-2"
                : undefined
            }
          >
            <FieldControl
              field={field}
              value={answers[field.key] ?? ""}
              onChange={(v) => update(field.key, v)}
              t={t}
              th={th}
            />
          </div>
        ))}
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      {statusMessage ? (
        <p className="text-sm text-emerald-700" role="status">
          {statusMessage}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={sectionIndex === 0 || pending}
          onClick={() => setSectionIndex((i) => Math.max(0, i - 1))}
        >
          {t("previous")}
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={pending} onClick={save}>
            {pending ? t("saving") : t("save")}
          </Button>
          {sectionIndex < sections.length - 1 ? (
            <Button
              type="button"
              disabled={pending}
              onClick={() => {
                save();
                setSectionIndex((i) => Math.min(sections.length - 1, i + 1));
              }}
            >
              {t("next")}
            </Button>
          ) : (
            <Button type="button" disabled={pending} onClick={save}>
              {pending ? t("saving") : t("saveFinish")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
