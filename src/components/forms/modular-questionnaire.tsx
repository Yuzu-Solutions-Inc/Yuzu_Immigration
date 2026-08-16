"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  CircleCheck,
  GripVertical,
  Loader2,
  Save,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { CertifiedSearchSelect } from "@/components/forms/certified-search-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  applyDerivedAnswers,
  CANONICAL_FIELDS,
  emptyTableRow,
  FIELD_GROUPS,
  fieldGroupForKey,
  fieldOptionLabel,
  fieldsForFormCodes,
  isFieldVisible,
  isGatedByParent,
  isTableVisible,
  orderedFieldOptions,
  primaryGateKey,
  sectionsForFields,
  tablesForFormCodes,
  type CanonicalField,
  type FieldOption,
  type QuestionnaireFieldGroup,
  type QuestionnaireSection,
  type RepeatableTable,
  type TableColumn,
} from "@/lib/ircc/fields";
import { questionnaireFillPercent, questionnaireSectionComplete } from "@/lib/ircc/form-readiness";
import { cn } from "@/lib/utils";

function personInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

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

const compactControlClass =
  "h-9 w-full min-w-0 rounded-lg border border-input bg-surface px-2 py-0 text-sm md:text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30";

const defaultSelectClass =
  "h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

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
  compact,
  placeholder,
}: {
  id: string;
  label: string;
  help?: string | null;
  type: CanonicalField["type"] | TableColumn["type"];
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  maxLength?: number;
  options?: FieldOption[];
  t: ReturnType<typeof useTranslations>;
  compact?: boolean;
  placeholder?: string;
}) {
  const locale = useLocale();
  const selectClass = compact ? compactControlClass : defaultSelectClass;
  const selectOptions = options
    ? orderedFieldOptions(options, locale, t)
    : [];
  const labeledOptions = selectOptions.map((opt) => ({
    value: opt.value,
    label: fieldOptionLabel(opt, locale, t),
  }));
  const searchable = type === "select" && labeledOptions.length > 5;
  const control =
    searchable ? (
      <CertifiedSearchSelect
        id={id}
        value={value}
        onChange={onChange}
        options={labeledOptions}
        placeholder={placeholder ?? t("selectPlaceholder")}
        required={required}
        compact={compact}
        label={label}
        noMatchLabel={t("noCertifiedMatch")}
        refineLabel={t("refineCertifiedSearch")}
      />
    ) : type === "select" ? (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-label={compact ? label : undefined}
        className={selectClass}
      >
        <option value="" disabled={Boolean(value)}>
          {placeholder ?? t("selectPlaceholder")}
        </option>
        {selectOptions.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {fieldOptionLabel(opt, locale, t)}
          </option>
        ))}
      </select>
    ) : type === "yesno" ? (
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={compact ? label : undefined}
        className={selectClass}
      >
        <option value="" disabled={Boolean(value)}>
          {placeholder ?? t("selectPlaceholder")}
        </option>
        <option value="Y">{t("options.yes")}</option>
        <option value="N">{t("options.no")}</option>
      </select>
    ) : type === "checkbox" ? (
      <label className="flex h-9 items-center justify-center gap-2 text-sm text-brand">
        <input
          id={id}
          type="checkbox"
          checked={value === "Y"}
          onChange={(e) => onChange(e.target.checked ? "Y" : "N")}
          aria-label={compact ? label : undefined}
          className="size-4 rounded border-input"
        />
        {compact ? null : t("options.yes")}
      </label>
    ) : type === "textarea" ? (
      <Textarea
        id={id}
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        rows={compact ? 2 : 3}
        aria-label={compact ? label : undefined}
        placeholder={placeholder}
        className={compact ? "min-h-9 rounded-lg px-2 py-1.5 text-sm" : "rounded-xl"}
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
        aria-label={compact ? label : undefined}
        placeholder={placeholder}
        className={compact ? compactControlClass : undefined}
      />
    );

  if (compact) {
    return (
      <div className="min-w-0 space-y-1">
        <Label
          htmlFor={id}
          className="block text-[11px] font-semibold tracking-wide text-muted-foreground uppercase"
        >
          {label}
          {required ? (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          ) : null}
        </Label>
        {control}
      </div>
    );
  }

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
      {control}
    </div>
  );
}

function RevealedFromAnswer({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 ml-1 space-y-4 border-l-2 border-action/35 pl-4">
      {children}
    </div>
  );
}

function fieldColSpan(col: TableColumn) {
  if (col.type === "textarea") return "col-span-2 sm:col-span-3";
  if (col.key === "employer" || col.key === "school" || col.key === "address") {
    return "sm:col-span-2";
  }
  return undefined;
}

function groupFieldLabel(
  key: string,
  t: ReturnType<typeof useTranslations>,
  group: QuestionnaireFieldGroup,
): string {
  if (group.useFieldLabels) return t(`fields.${key}`);
  if (key === "phoneCountryCode") return t("fields.phoneCode");
  if (key === "phone") return t("fields.phoneNumber");
  if (key === "phoneType") return t("fields.phoneKind");
  if (key === "marriageDate") return t("fields.marriageDate");
  if (key === "yearsTogether") return t("fields.yearsTogether");
  if (key === "commonLawStart") return t("fields.commonLawStart");
  if (key === "commonLawCity") return t("tables.columns.colCity");
  if (key === "commonLawProvince") return t("tables.columns.colProvince");
  if (key === "commonLawCountry") return t("tables.columns.colCountry");
  if (key === "streetNum" || key.endsWith("StreetNum")) return t("fields.streetNum");
  if (key === "streetName" || key.endsWith("StreetName")) return t("fields.streetName");
  if (key === "aptUnit" || key.endsWith("AptUnit")) return t("fields.aptUnit");
  if (key === "postalCode" || key.endsWith("PostalCode")) return t("fields.postalCode");
  if (key === "city" || key.endsWith("City")) return t("tables.columns.colCity");
  if (key === "provinceState" || key.endsWith("ProvinceState")) {
    return t("tables.columns.colProvince");
  }
  if (key === "country" || key.endsWith("Country")) return t("tables.columns.colCountry");
  if (key.endsWith("From")) return t("tables.columns.colFrom");
  if (key.endsWith("To")) return t("tables.columns.colTo");
  if (key.endsWith("FamilyName")) return t("tables.columns.colFamilyName");
  if (key.endsWith("GivenName")) return t("tables.columns.colGivenName");
  if (key.endsWith("Dob")) return t("tables.columns.colDob");
  if (key.endsWith("Cob")) return t("tables.columns.colCob");
  if (key.endsWith("Address")) return t("tables.columns.colAddress");
  if (key.endsWith("Occupation")) return t("tables.columns.colOccupation");
  if (key.endsWith("MaritalStatus")) return t("tables.columns.colMaritalStatus");
  if (key.endsWith("Telephone")) return t("tables.columns.colPhone");
  if (key.endsWith("Accompanying")) return t("tables.columns.colAccompanying");
  if (key.endsWith("Relationship")) return t("tables.columns.colRelationship");
  return t(`fields.${key}`);
}

function groupFieldSpan(field: CanonicalField, columns?: 2 | 3) {
  if (field.type === "textarea" || field.wide) {
    return columns === 2 ? "sm:col-span-2" : "col-span-2 sm:col-span-3";
  }
  if (
    field.key === "streetName" ||
    field.key === "resStreetName" ||
    field.key.endsWith("StreetName")
  ) {
    return "sm:col-span-2";
  }
  return undefined;
}

function inlineFieldClass(key: string) {
  if (key === "phoneCountryCode") return "w-[5.25rem] shrink-0";
  if (key === "phoneType") return "w-[10.5rem] shrink-0";
  return "min-w-0 flex-1";
}

function FieldGroupEditor({
  group,
  fields,
  answers,
  onChange,
  t,
  th,
}: {
  group: QuestionnaireFieldGroup;
  fields: CanonicalField[];
  answers: Record<string, unknown>;
  onChange: (key: string, value: string) => void;
  t: ReturnType<typeof useTranslations>;
  th: ReturnType<typeof useTranslations>;
}) {
  if (fields.length === 0) return null;
  const twoCol = group.columns === 2;
  const controls = fields.map((field) => (
    <div
      key={field.key}
      className={
        group.layout === "inline"
          ? inlineFieldClass(field.key)
          : groupFieldSpan(field, group.columns)
      }
    >
      <FieldControl
        id={`group-${group.key}-${field.key}`}
        label={groupFieldLabel(field.key, t, group)}
        help={field.helpKey ? th(field.helpKey) : null}
        type={field.type}
        value={String(answers[field.key] ?? "")}
        onChange={(v) => onChange(field.key, v)}
        required={field.required}
        maxLength={field.maxLength}
        options={field.options}
        t={t}
        compact
        placeholder={field.key === "phoneCountryCode" ? "+" : undefined}
      />
    </div>
  ));
  return (
    <div className="space-y-2">
      <h4 className="font-heading text-sm font-semibold text-brand">
        {t(`groups.${group.key}`)}
      </h4>
      {group.layout === "inline" ? (
        <div className="flex min-w-0 gap-2">{controls}</div>
      ) : (
        <div className="rounded-xl border border-border bg-surface px-3 py-3">
          <div
            className={cn(
              "grid min-w-0 gap-x-3 gap-y-3",
              twoCol
                ? "grid-cols-1 sm:grid-cols-2"
                : "grid-cols-2 sm:grid-cols-3",
            )}
          >
            {controls}
          </div>
        </div>
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
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const minRows = table.minRows ?? 0;
  const reorderable = table.reorderable !== false;

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
    if (rows.length <= minRows) return;
    onChange(rows.filter((_, i) => i !== index));
  }

  function moveRow(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  }

  function clearDrag() {
    setDragIndex(null);
    setDropIndex(null);
  }

  return (
    <div className="space-y-3 sm:col-span-2">
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

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {rows.map((row, rowIndex) => (
          <div
            key={`${table.key}-${rowIndex}`}
            onDragOver={
              reorderable
                ? (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropIndex !== rowIndex) setDropIndex(rowIndex);
                  }
                : undefined
            }
            onDrop={
              reorderable
                ? (e) => {
                    e.preventDefault();
                    const from = Number(e.dataTransfer.getData("text/plain"));
                    if (Number.isFinite(from)) moveRow(from, rowIndex);
                    clearDrag();
                  }
                : undefined
            }
            className={cn(
              "flex gap-2 border-border px-3 py-3",
              rowIndex > 0 && "border-t",
              dragIndex === rowIndex && "opacity-50",
              dropIndex === rowIndex &&
                dragIndex !== null &&
                dragIndex !== rowIndex &&
                "bg-accent/60",
            )}
          >
            <div className="flex w-7 shrink-0 flex-col items-center gap-1 pt-5">
              {reorderable ? (
                <span
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={t("reorderRow")}
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", String(rowIndex));
                    setDragIndex(rowIndex);
                  }}
                  onDragEnd={clearDrag}
                  className="flex size-7 cursor-grab items-center justify-center rounded-full bg-muted text-muted-foreground active:cursor-grabbing"
                >
                  <GripVertical className="size-3.5" aria-hidden />
                </span>
              ) : null}
              <span className="text-sm font-medium text-brand">{rowIndex + 1}</span>
            </div>
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-2 gap-y-3 sm:grid-cols-3">
              {table.columns.map((col) => (
                <div key={col.key} className={fieldColSpan(col)}>
                  <FieldControl
                    id={`${table.key}-${rowIndex}-${col.key}`}
                    label={t(`tables.columns.${col.labelKey}`)}
                    type={col.type}
                    value={row[col.key] ?? ""}
                    onChange={(v) => updateCell(rowIndex, col.key, v)}
                    required={col.required}
                    maxLength={col.maxLength}
                    options={col.options}
                    t={t}
                    compact
                    placeholder={
                      col.placeholderKey
                        ? t(`placeholders.${col.placeholderKey}`)
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
            <div className="shrink-0 pt-4">
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={rows.length <= minRows}
                onClick={() => removeRow(rowIndex)}
                aria-label={t("removeRow")}
                className="text-muted-foreground"
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={rows.length >= table.maxRows}
        onClick={addRow}
        className="text-sm font-medium text-highlight underline underline-offset-2 decoration-highlight/80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + {t(`tables.${table.key}.add`)}
      </button>
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
  return applyDerivedAnswers(next);
}

function SectionProgressNav({
  sections,
  sectionIndex,
  percent,
  sectionComplete,
  onSelect,
  disabled,
  t,
  clientSubmit,
}: {
  sections: QuestionnaireSection[];
  sectionIndex: number;
  percent: number;
  sectionComplete: boolean[];
  onSelect: (index: number) => void;
  disabled?: boolean;
  t: ReturnType<typeof useTranslations>;
  clientSubmit?: {
    allComplete: boolean;
    pending: boolean;
    submitted: boolean;
    attention: boolean;
    onSubmit: () => void;
  };
}) {
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!clientSubmit?.attention || !clientSubmit.allComplete) return;
    submitRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [clientSubmit?.attention, clientSubmit?.allComplete]);

  return (
    <aside className="space-y-4 lg:sticky lg:top-20 lg:w-60 lg:shrink-0">
      {clientSubmit ? (
        <section
          aria-labelledby="client-submit-heading"
          className={cn(
            "space-y-3 rounded-xl border bg-surface p-4 shadow-elevated",
            clientSubmit.allComplete && !clientSubmit.pending
              ? "border-success/40"
              : "border-border",
          )}
        >
          <div className="space-y-1">
            <h2
              id="client-submit-heading"
              className="font-heading text-sm font-semibold text-brand"
            >
              {t("clientSubmitLabel")}
            </h2>
            <p
              className={cn(
                "text-xs leading-snug",
                clientSubmit.allComplete
                  ? "font-medium text-success"
                  : "text-muted-foreground",
              )}
            >
              {clientSubmit.submitted && !clientSubmit.attention
                ? t("clientSubmitDoneHint")
                : clientSubmit.allComplete
                  ? t("clientSubmitReadyHint")
                  : t("clientSubmitLockedHint")}
            </p>
          </div>
          <Button
            ref={submitRef}
            type="button"
            disabled={!clientSubmit.allComplete || clientSubmit.pending}
            aria-busy={clientSubmit.pending}
            onClick={clientSubmit.onSubmit}
            className={cn(
              "h-11 w-full text-sm font-semibold shadow-elevated",
              clientSubmit.allComplete && !clientSubmit.pending
                ? "bg-success text-white hover:bg-success/90"
                : "border-transparent bg-muted text-muted-foreground hover:bg-muted disabled:opacity-100",
              clientSubmit.attention &&
                clientSubmit.allComplete &&
                "animate-submit-attention",
            )}
          >
            {clientSubmit.pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t("clientSubmitting")}
              </>
            ) : clientSubmit.submitted && clientSubmit.allComplete ? (
              t("clientSubmitAgain")
            ) : (
              t("clientSubmit")
            )}
          </Button>
        </section>
      ) : null}

      <nav
        aria-label={t("sectionStepsLabel")}
        className="rounded-xl border border-border bg-surface p-4 shadow-elevated"
      >
        <div className="space-y-3 border-b border-border pb-4">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("progressLabel")}
          </p>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t("progressComplete", { percent })}
          >
            <div
              className="h-full rounded-full bg-action transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm font-semibold text-brand">
            {t("progressComplete", { percent })}
          </p>
        </div>

        <div className="relative pt-4">
          <p className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t("sectionStepsLabel")}
          </p>
          <span
            aria-hidden
            className="absolute top-[calc(1.75rem+0.75rem)] bottom-4 left-[1.375rem] w-px -translate-x-1/2 bg-border"
          />
          <ol className="space-y-1">
          {sections.map((s, i) => {
            const current = i === sectionIndex;
            const complete = sectionComplete[i] ?? false;
            return (
              <li key={s} className="relative">
                <button
                  type="button"
                  aria-current={current ? "step" : undefined}
                  aria-label={
                    complete
                      ? `${t(`sections.${s}`)} — ${t("sectionComplete")}`
                      : t(`sections.${s}`)
                  }
                  disabled={disabled}
                  onClick={() => onSelect(i)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-3 rounded-xl px-1.5 py-1.5 text-left transition-colors",
                    current && "bg-action/15",
                    !current && !disabled && "hover:bg-white/70",
                    disabled && "cursor-not-allowed opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      complete && "bg-success text-white",
                      current &&
                        !complete &&
                        "bg-action text-action-foreground",
                      !complete &&
                        !current &&
                        "border-2 border-border bg-surface text-graphite-700",
                    )}
                    aria-hidden
                  >
                    {complete ? (
                      <CircleCheck className="size-4" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span
                    className={cn(
                      "min-w-0 text-sm font-semibold leading-snug",
                      complete && "text-success",
                      current && !complete && "text-brand",
                      !complete && !current && "text-graphite-700",
                    )}
                  >
                    {t(`sections.${s}`)}
                  </span>
                </button>
              </li>
            );
          })}
          </ol>
        </div>
      </nav>
    </aside>
  );
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

type SaveIntent = "save" | "next" | "finish";

function SaveFeedbackBar({
  status,
  message,
  unsaved,
  t,
}: {
  status: "idle" | "saving" | "saved" | "error";
  message?: string | null;
  unsaved: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  if (status === "error" && message) {
    return (
      <div
        className="flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        role="alert"
      >
        <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
    );
  }

  if (status === "saving") {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl border border-border bg-canvas px-4 py-3 text-sm text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
        <span>{t("saving")}</span>
      </div>
    );
  }

  if (status === "saved" && message) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm font-medium text-success-text"
        role="status"
        aria-live="polite"
      >
        <CircleCheck className="size-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </div>
    );
  }

  if (unsaved) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl border border-warning/30 bg-warning-bg px-4 py-3 text-sm text-warning-text"
        role="status"
      >
        <span
          className="size-2 shrink-0 rounded-full bg-warning"
          aria-hidden
        />
        <span>{t("unsavedChanges")}</span>
      </div>
    );
  }

  return null;
}

export function ModularQuestionnaire({
  people,
  onSave,
  pending,
  errorMessage,
  mode = "staff",
  onSubmitQuestionnaire,
  submitPending,
  submittedAt,
  readOnly = false,
}: {
  people: QuestionnairePerson[];
  onSave: (
    personId: string,
    answers: Record<string, unknown>,
    section: string,
  ) => void | Promise<{ error?: string } | void>;
  pending?: boolean;
  errorMessage?: string | null;
  mode?: "staff" | "client";
  onSubmitQuestionnaire?: (
    personId: string,
    answers: Record<string, unknown>,
    section: string,
  ) => void;
  submitPending?: boolean;
  submittedAt?: string | null;
  readOnly?: boolean;
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
  const [busyIntent, setBusyIntent] = useState<SaveIntent | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [saveStatusMessage, setSaveStatusMessage] = useState<string | null>(
    null,
  );
  const [isDirty, setIsDirty] = useState(false);
  const savedNoticeTimeoutRef = useRef<number | null>(null);

  function mapSaveError(code: string): string {
    return (
      {
        invalid: t("errors.invalid"),
        unauthorized: t("errors.unauthorized"),
        save_failed: t("errors.saveFailed"),
        granted: t("errors.granted"),
        expired: t("errors.expired"),
        auth_required: t("shareAuth.errors.authRequired"),
      }[code] ?? t("errors.generic")
    );
  }

  function markDirty() {
    setIsDirty(true);
    if (saveStatus === "saved" || saveStatus === "error") {
      setSaveStatus("idle");
      setSaveStatusMessage(null);
    }
    if (savedNoticeTimeoutRef.current != null) {
      window.clearTimeout(savedNoticeTimeoutRef.current);
      savedNoticeTimeoutRef.current = null;
    }
  }

  useEffect(() => {
    if (!activePersonId) return;
    const person = people.find((p) => p.id === activePersonId);
    if (!person) return;
    setAnswers(answersToState(person.answers));
    setTableData(initTables(person.formCodes, person.answers));
    setSectionIndex(0);
    setBusyIntent(null);
    setSaveStatus("idle");
    setSaveStatusMessage(null);
    setIsDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset on person switch only
  }, [activePersonId]);

  useEffect(() => {
    return () => {
      if (savedNoticeTimeoutRef.current != null) {
        window.clearTimeout(savedNoticeTimeoutRef.current);
      }
    };
  }, []);

  const fillPercentByPerson = useMemo(() => {
    const liveAnswers = { ...answers, ...tableData };
    const map = new Map<string, number>();
    for (const person of people) {
      const source =
        person.id === activePersonId ? liveAnswers : person.answers;
      map.set(
        person.id,
        questionnaireFillPercent(person.formCodes, source),
      );
    }
    return map;
  }, [people, activePersonId, answers, tableData]);

  const activeFillPercent = activePerson
    ? (fillPercentByPerson.get(activePerson.id) ?? 0)
    : 0;

  const liveAnswers = useMemo(
    () => ({ ...answers, ...tableData }),
    [answers, tableData],
  );

  const sectionCompleteFlags = useMemo(() => {
    if (!activePerson) return sections.map(() => false);
    return sections.map((sectionKey) =>
      questionnaireSectionComplete(
        activePerson.formCodes,
        sectionKey,
        liveAnswers,
      ),
    );
  }, [activePerson, sections, liveAnswers]);

  const allPeopleComplete = useMemo(() => {
    if (people.length === 0) return false;
    return people.every((person) => {
      if (!person.formCodes.length) return true;
      return (fillPercentByPerson.get(person.id) ?? 0) >= 100;
    });
  }, [people, fillPercentByPerson]);

  const [submitAttention, setSubmitAttention] = useState(false);
  const wasAllCompleteRef = useRef(false);

  useEffect(() => {
    if (mode !== "client") return;
    if (allPeopleComplete && !wasAllCompleteRef.current) {
      setSubmitAttention(true);
      const id = window.setTimeout(() => setSubmitAttention(false), 3200);
      wasAllCompleteRef.current = true;
      return () => window.clearTimeout(id);
    }
    if (!allPeopleComplete) {
      wasAllCompleteRef.current = false;
      setSubmitAttention(false);
    }
  }, [allPeopleComplete, mode]);

  const section = (sections[sectionIndex] ??
    "identity") as QuestionnaireSection;

  const sectionTables = tables.filter(
    (tbl) => tbl.section === section && isTableVisible(tbl, answers),
  );
  const sectionFieldList = fields.filter(
    (f) => f.section === section && !f.hidden,
  );
  const sectionGroups = FIELD_GROUPS.filter((g) => g.section === section);

  function update(key: string, value: string) {
    markDirty();
    setAnswers((prev) =>
      applyDerivedAnswers({ ...prev, [key]: value, hasRepresentative: "Y" }),
    );
  }

  function buildSavePayload(): Record<string, unknown> | null {
    if (!activePerson) return null;
    const payload: Record<string, unknown> = applyDerivedAnswers({
      ...answers,
      hasRepresentative: "Y",
    });
    for (const [key, rows] of Object.entries(tableData)) {
      payload[key] = rows;
    }
    return payload;
  }

  async function requestSave(intent: SaveIntent) {
    const payload = buildSavePayload();
    if (!activePerson || !payload) return;

    setBusyIntent(intent);
    setSaveStatus("saving");
    setSaveStatusMessage(null);
    if (savedNoticeTimeoutRef.current != null) {
      window.clearTimeout(savedNoticeTimeoutRef.current);
      savedNoticeTimeoutRef.current = null;
    }

    const toastId = toast.loading(t("saving"));

    try {
      const result = await onSave(activePerson.id, payload, section);
      if (result?.error) {
        const errorText = mapSaveError(result.error);
        toast.error(errorText, { id: toastId });
        setSaveStatus("error");
        setSaveStatusMessage(errorText);
        return;
      }

      if (intent === "next") {
        setSectionIndex((i) => Math.min(sections.length - 1, i + 1));
      }

      const successText =
        intent === "next" ? t("saveSuccessNext") : t("saveSuccess");
      toast.success(successText, { id: toastId });
      setIsDirty(false);
      setSaveStatus("saved");
      setSaveStatusMessage(successText);
      savedNoticeTimeoutRef.current = window.setTimeout(() => {
        setSaveStatus("idle");
        setSaveStatusMessage(null);
        savedNoticeTimeoutRef.current = null;
      }, 4000);
    } catch {
      const errorText = t("errors.saveFailed");
      toast.error(errorText, { id: toastId });
      setSaveStatus("error");
      setSaveStatusMessage(errorText);
    } finally {
      setBusyIntent(null);
    }
  }

  function visibleGroupFields(group: QuestionnaireFieldGroup) {
    return group.fieldKeys
      .map((key) => fields.find((f) => f.key === key))
      .filter(
        (f): f is CanonicalField => f != null && isFieldVisible(f, answers),
      );
  }

  function parentInSection(key: string | undefined) {
    return Boolean(key && sectionFieldList.some((f) => f.key === key));
  }

  function groupNestsUnder(group: QuestionnaireFieldGroup, parentKey: string) {
    const groupFields = visibleGroupFields(group);
    if (groupFields.length === 0) return false;
    return groupFields.every((f) =>
      isGatedByParent(f.showWhen, parentKey, answers),
    );
  }

  function buildSectionNodes() {
    const emittedFields = new Set<string>();
    const emittedGroups = new Set<string>();
    const emittedTables = new Set<string>();
    const nodes: ReactNode[] = [];

    function pushTable(table: RepeatableTable) {
      if (emittedTables.has(table.key)) return;
      emittedTables.add(table.key);
      nodes.push(
        <TableEditor
          key={table.key}
          table={table}
          rows={tableData[table.key] ?? [emptyTableRow(table)]}
          onChange={(rows) => {
            markDirty();
            setTableData((prev) => ({ ...prev, [table.key]: rows }));
          }}
          t={t}
          th={th}
        />,
      );
    }

    function pushGroup(group: QuestionnaireFieldGroup) {
      if (emittedGroups.has(group.key)) return;
      const groupFields = visibleGroupFields(group);
      if (groupFields.length === 0) return;
      emittedGroups.add(group.key);
      for (const field of groupFields) emittedFields.add(field.key);
      nodes.push(
        <FieldGroupEditor
          key={group.key}
          group={group}
          fields={groupFields}
          answers={answers}
          onChange={update}
          t={t}
          th={th}
        />,
      );
    }

    function followUpsFor(parentKey: string): ReactNode[] {
      const nested: ReactNode[] = [];

      for (const group of sectionGroups) {
        if (emittedGroups.has(group.key)) continue;
        if (!groupNestsUnder(group, parentKey)) continue;
        const groupFields = visibleGroupFields(group);
        emittedGroups.add(group.key);
        for (const field of groupFields) emittedFields.add(field.key);
        nested.push(
          <FieldGroupEditor
            key={group.key}
            group={group}
            fields={groupFields}
            answers={answers}
            onChange={update}
            t={t}
            th={th}
          />,
        );
      }

      for (const table of sectionTables) {
        if (emittedTables.has(table.key)) continue;
        if (!isGatedByParent(table.showWhen, parentKey, answers)) continue;
        emittedTables.add(table.key);
        nested.push(
          <TableEditor
            key={table.key}
            table={table}
            rows={tableData[table.key] ?? [emptyTableRow(table)]}
            onChange={(rows) => {
              markDirty();
              setTableData((prev) => ({ ...prev, [table.key]: rows }));
            }}
            t={t}
            th={th}
          />,
        );
      }

      for (const field of sectionFieldList) {
        if (emittedFields.has(field.key)) continue;
        if (!isFieldVisible(field, answers)) continue;
        if (fieldGroupForKey(field.key)) continue;
        if (!isGatedByParent(field.showWhen, parentKey, answers)) continue;
        nested.push(emitFieldWithFollowUps(field));
      }

      return nested;
    }

    function emitFieldWithFollowUps(field: CanonicalField): ReactNode {
      emittedFields.add(field.key);
      const followUps = followUpsFor(field.key);
      const control = (
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
      );
      if (followUps.length === 0) {
        return (
          <div
            key={field.key}
            className={
              field.wide || field.type === "textarea"
                ? "sm:col-span-2"
                : undefined
            }
          >
            {control}
          </div>
        );
      }
      return (
        <div key={field.key} className="sm:col-span-2">
          {control}
          <RevealedFromAnswer>{followUps}</RevealedFromAnswer>
        </div>
      );
    }

    for (const field of sectionFieldList) {
      if (emittedFields.has(field.key)) continue;
      if (!isFieldVisible(field, answers)) continue;
      const group = fieldGroupForKey(field.key);
      if (group) {
        if (emittedGroups.has(group.key)) continue;
        const groupFields = visibleGroupFields(group);
        const gate = groupFields[0]
          ? primaryGateKey(groupFields[0].showWhen)
          : undefined;
        const waitsForParent =
          parentInSection(gate) &&
          groupFields.every(
            (f) => primaryGateKey(f.showWhen) === gate,
          );
        if (waitsForParent) continue;
        pushGroup(group);
        continue;
      }
      const gate = primaryGateKey(field.showWhen);
      if (
        parentInSection(gate) &&
        isGatedByParent(field.showWhen, gate as string, answers)
      ) {
        continue;
      }
      nodes.push(emitFieldWithFollowUps(field));
    }

    for (const group of sectionGroups) pushGroup(group);
    for (const table of sectionTables) {
      if (emittedTables.has(table.key)) continue;
      const gate = primaryGateKey(table.showWhen);
      if (parentInSection(gate)) continue;
      pushTable(table);
    }

    return nodes;
  }

  if (!activePerson) {
    return (
      <p className="text-sm text-muted-foreground">{t("questionnaireEmpty")}</p>
    );
  }

  const showPersonTabs = people.length > 1;
  const saveBusy = busyIntent === "save";
  const busy =
    Boolean(pending) || busyIntent != null || Boolean(submitPending);

  function handleClientSubmit() {
    if (!activePerson || !onSubmitQuestionnaire || !allPeopleComplete) return;
    const payload = applyDerivedAnswers({ ...answers, ...tableData });
    onSubmitQuestionnaire(activePerson.id, payload, section);
  }

  return (
    <div className="w-full space-y-6">
      {showPersonTabs ? (
        <div className="space-y-4 rounded-xl border border-border bg-canvas p-4">
          <div className="space-y-2">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {t("personTabsLabel")}
            </p>
            <div
              role="tablist"
              aria-label={t("personTabsLabel")}
              className="flex flex-wrap gap-2"
            >
              {people.map((person) => {
                const selected = person.id === activePerson.id;
                const percent = fillPercentByPerson.get(person.id) ?? 0;
                return (
                  <button
                    key={person.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setActivePersonId(person.id)}
                    className={cn(
                      "flex min-h-12 min-w-[10rem] flex-1 cursor-pointer items-center gap-3 rounded-xl border-2 px-3 py-2 text-left shadow-elevated transition-colors sm:flex-none",
                      selected
                        ? "border-action bg-surface text-brand"
                        : "border-border bg-surface text-brand hover:border-action hover:bg-white",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                        selected
                          ? "bg-action text-action-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                      aria-hidden
                    >
                      {personInitials(person.displayName)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {person.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {tr(person.role as never)}
                      </span>
                      <span className="mt-0.5 block text-xs font-semibold text-action">
                        {t("progressComplete", { percent })}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-sm text-muted-foreground">
              {t("personTabsHelp", { name: activePerson.displayName })}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <SectionProgressNav
          sections={sections}
          sectionIndex={sectionIndex}
          percent={activeFillPercent}
          sectionComplete={sectionCompleteFlags}
          onSelect={setSectionIndex}
          disabled={busy}
          t={t}
          clientSubmit={
            mode === "client"
              ? {
                  allComplete: allPeopleComplete,
                  pending: Boolean(submitPending),
                  submitted: Boolean(submittedAt),
                  attention: submitAttention,
                  onSubmit: handleClientSubmit,
                }
              : undefined
          }
        />

        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-elevated sm:p-6">
            <header className="space-y-1 border-b border-border pb-5">
              <h3 className="font-heading text-xl font-semibold text-brand">
                {t(`sections.${section}`)}
              </h3>
              <p className="text-sm text-muted-foreground">
                {t(`sectionLedes.${section}`)}
              </p>
            </header>

            <div
              className={cn(
                "mt-6 space-y-6",
                readOnly && "pointer-events-none opacity-80",
              )}
            >
              {buildSectionNodes()}
            </div>

            <div className="mt-6 space-y-4 border-t border-border pt-5">
              <SaveFeedbackBar
                status={
                  saveStatus === "idle" && errorMessage
                    ? "error"
                    : saveStatus
                }
                message={
                  saveStatus === "error" || saveStatus === "saved"
                    ? saveStatusMessage
                    : errorMessage
                }
                unsaved={isDirty && saveStatus !== "saving" && !readOnly}
                t={t}
              />

              <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={sectionIndex === 0 || busy}
          onClick={() => setSectionIndex((i) => Math.max(0, i - 1))}
        >
          {t("previous")}
        </Button>
        {readOnly ? null : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            aria-busy={saveBusy}
            className={cn(saveBusy && "animate-save-pulse disabled:opacity-100")}
            onClick={() => requestSave("save")}
          >
            {saveBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            {t("save")}
          </Button>
          {sectionIndex < sections.length - 1 ? (
            <Button
              type="button"
              disabled={busy}
              aria-busy={busyIntent === "next"}
              className={cn(
                "hover:bg-action-hover hover:shadow-md active:bg-action-active active:scale-[0.97]",
                busyIntent === "next" && "disabled:opacity-100",
              )}
              onClick={() => requestSave("next")}
            >
              {busyIntent === "next" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("next")
              )}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={busy}
              aria-busy={busyIntent === "finish"}
              className={cn(
                "hover:bg-action-hover hover:shadow-md active:bg-action-active active:scale-[0.97]",
                busyIntent === "finish" && "disabled:opacity-100",
              )}
              onClick={() => requestSave("finish")}
            >
              {busyIntent === "finish" ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t("saving")}
                </>
              ) : (
                t("saveFinish")
              )}
            </Button>
          )}
        </div>
        )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
