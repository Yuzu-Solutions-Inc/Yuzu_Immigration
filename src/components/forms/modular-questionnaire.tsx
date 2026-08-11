"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CANONICAL_FIELDS,
  emptyTableRow,
  fieldsForFormCodes,
  isFieldVisible,
  isTableVisible,
  sectionsForFields,
  tablesForFormCodes,
  type CanonicalField,
  type QuestionnaireSection,
  type RepeatableTable,
  type TableColumn,
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
  id,
  label,
  help,
  type,
  value,
  onChange,
  required,
  maxLength,
  options,
  t,
}: {
  id: string;
  label: string;
  help?: string | null;
  type: CanonicalField["type"] | TableColumn["type"];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  options?: Array<{ value: string; labelKey: string }>;
  t: ReturnType<typeof useTranslations>;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="inline-flex items-center">
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden>
            *
          </span>
        ) : null}
        {help ? <HelpTip text={help} /> : null}
      </Label>
      {type === "select" ? (
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        >
          <option value="" disabled={Boolean(value)}>
            {t("selectPlaceholder")}
          </option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {t(`options.${opt.labelKey}`)}
            </option>
          ))}
        </select>
      ) : type === "yesno" ? (
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
      ) : type === "checkbox" ? (
        <label className="flex h-10 items-center gap-2 text-sm text-brand">
          <input
            id={id}
            type="checkbox"
            checked={value === "Y"}
            onChange={(e) => onChange(e.target.checked ? "Y" : "N")}
            className="size-4 rounded border-input"
          />
          {t("options.yes")}
        </label>
      ) : type === "textarea" ? (
        <Textarea
          id={id}
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          rows={3}
          className="rounded-xl"
        />
      ) : (
        <Input
          id={id}
          type={
            type === "email"
              ? "email"
              : type === "tel"
                ? "tel"
                : type === "date"
                  ? "date"
                  : type === "month"
                    ? "month"
                    : "text"
          }
          value={value}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          required={required}
        />
      )}
    </div>
  );
}

function TableEditor({
  table,
  rows,
  onChange,
  t,
  th,
}: {
  table: RepeatableTable;
  rows: Array<Record<string, string>>;
  onChange: (rows: Array<Record<string, string>>) => void;
  t: ReturnType<typeof useTranslations>;
  th: ReturnType<typeof useTranslations>;
}) {
  function updateCell(rowIndex: number, key: string, value: string) {
    onChange(
      rows.map((row, i) => (i === rowIndex ? { ...row, [key]: value } : row)),
    );
  }

  function addRow() {
    if (rows.length >= table.maxRows) return;
    onChange([...rows, emptyTableRow(table)]);
  }

  function removeRow(index: number) {
    if (rows.length <= (table.minRows ?? 0)) return;
    onChange(rows.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h4 className="font-heading text-sm font-semibold text-brand">
            {t(`tables.${table.key}.title`)}
          </h4>
          {table.helpKey ? (
            <p className="text-xs text-muted-foreground">{th(table.helpKey)}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t(`tables.${table.key}.help`)}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rows.length >= table.maxRows}
          onClick={addRow}
        >
          {t("addRow")}
        </Button>
      </div>
      <div className="space-y-4">
        {rows.map((row, rowIndex) => (
          <div
            key={`${table.key}-${rowIndex}`}
            className="space-y-3 rounded-xl border border-border bg-canvas/60 p-4"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {t("rowLabel", { n: rowIndex + 1 })}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={rows.length <= (table.minRows ?? 0)}
                onClick={() => removeRow(rowIndex)}
              >
                {t("removeRow")}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {table.columns.map((col) => (
                <FieldControl
                  key={col.key}
                  id={`${table.key}-${rowIndex}-${col.key}`}
                  label={t(`tables.columns.${col.labelKey}`)}
                  type={col.type}
                  value={row[col.key] ?? ""}
                  onChange={(v) => updateCell(rowIndex, col.key, v)}
                  required={col.required}
                  maxLength={col.maxLength}
                  options={col.options}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
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
  const next: Record<string, unknown> = { hasRepresentative: "Y" };
  for (const field of CANONICAL_FIELDS) {
    const v = initial[field.key];
    if (v !== undefined && v !== null) {
      next[field.key] =
        field.type === "checkbox"
          ? String(v).toUpperCase() === "Y" || v === true
            ? "Y"
            : "N"
          : String(v);
    }
  }
  return next;
}

function initTables(
  formCodes: string[],
  initial: Record<string, unknown>,
): Record<string, Array<Record<string, string>>> {
  const out: Record<string, Array<Record<string, string>>> = {};
  for (const table of tablesForFormCodes(formCodes)) {
    const raw = initial[table.key];
    if (Array.isArray(raw) && raw.length > 0) {
      out[table.key] = raw.map((row) => {
        const next = emptyTableRow(table);
        if (row && typeof row === "object") {
          for (const col of table.columns) {
            const v = (row as Record<string, unknown>)[col.key];
            if (v !== undefined && v !== null) next[col.key] = String(v);
          }
        }
        return next;
      });
    } else {
      out[table.key] = [emptyTableRow(table)];
    }
  }
  return out;
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
  const tables = useMemo(
    () => tablesForFormCodes(activePerson?.formCodes ?? []),
    [activePerson?.formCodes],
  );
  const sections = useMemo(
    () => sectionsForFields(fields, tables),
    [fields, tables],
  );
  const [answers, setAnswers] = useState<Record<string, unknown>>(() =>
    answersToState(activePerson?.answers ?? {}),
  );
  const [tableData, setTableData] = useState<
    Record<string, Array<Record<string, string>>>
  >(() => initTables(activePerson?.formCodes ?? [], activePerson?.answers ?? {}));
  const [sectionIndex, setSectionIndex] = useState(0);

  useEffect(() => {
    if (!activePersonId) return;
    const person = people.find((p) => p.id === activePersonId);
    if (!person) return;
    setAnswers(answersToState(person.answers));
    setTableData(initTables(person.formCodes, person.answers));
    setSectionIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on person switch only
  }, [activePersonId]);

  const section = (sections[sectionIndex] ??
    "identity") as QuestionnaireSection;

  const sectionFields = fields.filter(
    (f) => f.section === section && isFieldVisible(f, answers),
  );
  const sectionTables = tables.filter(
    (tbl) => tbl.section === section && isTableVisible(tbl, answers),
  );

  function update(key: string, value: string) {
    setAnswers((prev) => ({ ...prev, [key]: value, hasRepresentative: "Y" }));
  }

  function save() {
    if (!activePerson) return;
    const payload: Record<string, unknown> = {
      ...answers,
      hasRepresentative: "Y",
    };
    for (const [key, rows] of Object.entries(tableData)) {
      payload[key] = rows;
    }
    onSave(activePerson.id, payload, section);
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
              field.wide || field.type === "textarea" ? "sm:col-span-2" : undefined
            }
          >
            <FieldControl
              id={`field-${field.key}`}
              label={t(`fields.${field.key}`)}
              help={field.helpKey ? th(field.helpKey) : null}
              type={field.type}
              value={String(answers[field.key] ?? "")}
              onChange={(v) => update(field.key, v)}
              required={field.required}
              maxLength={field.maxLength}
              options={field.options}
              t={t}
            />
          </div>
        ))}
        {sectionTables.map((table) => (
          <TableEditor
            key={table.key}
            table={table}
            rows={tableData[table.key] ?? [emptyTableRow(table)]}
            onChange={(rows) =>
              setTableData((prev) => ({ ...prev, [table.key]: rows }))
            }
            t={t}
            th={th}
          />
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
