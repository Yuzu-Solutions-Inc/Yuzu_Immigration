"use client";

import { useActionState, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  saveCustomFormTemplateAction,
  type CustomFormActionState,
} from "@/app/actions/custom-forms";
import { CustomQuestionnaire } from "@/components/custom-forms/custom-questionnaire";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel, FieldGrid } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  CUSTOM_FORM_MODULES,
  insertModuleIntoSchema,
  type CustomFormModuleId,
} from "@/lib/custom-forms/modules";
import {
  CUSTOM_FORM_FIELD_TYPES,
  emptyCustomFormSchema,
  gateFieldCandidates,
  localizedLabel,
  newBuilderId,
  slugFromLabel,
  uniqueKeyInSchema,
  type CustomField,
  type CustomFormSchema,
  type CustomSection,
  type CustomFieldType,
  type LocalizedText,
} from "@/lib/custom-forms/schema";
import type { ShowWhen } from "@/lib/forms/visibility";

const initial: CustomFormActionState = {};

function text(en: string, fr = "", es = ""): LocalizedText {
  return { en, fr: fr || undefined, es: es || undefined };
}

function emptyField(schema: CustomFormSchema): CustomField {
  const key = uniqueKeyInSchema(schema, "question");
  return {
    id: newBuilderId(),
    key,
    type: "text",
    label: text("New question", "Nouvelle question", "Nueva pregunta"),
  };
}

function emptySection(schema: CustomFormSchema): CustomSection {
  const key = uniqueKeyInSchema(schema, "section");
  return {
    id: newBuilderId(),
    key,
    title: text("New section", "Nouvelle section", "Nueva sección"),
    fields: [],
  };
}

export function CustomFormBuilder({
  locale,
  templateId,
  initialTitle,
  initialDescription,
  initialSchema,
}: {
  locale: string;
  templateId?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialSchema?: CustomFormSchema;
}) {
  const t = useTranslations("customForms");
  const [title, setTitle] = useState(initialTitle ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [schema, setSchema] = useState<CustomFormSchema>(
    initialSchema ?? emptyCustomFormSchema(),
  );
  const [selectedSectionId, setSelectedSectionId] = useState(
    initialSchema?.sections[0]?.id ?? "",
  );
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [tab, setTab] = useState<"build" | "preview">("build");
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>({});
  const [state, action, pending] = useActionState(
    saveCustomFormTemplateAction,
    initial,
  );

  const section =
    schema.sections.find((item) => item.id === selectedSectionId) ??
    schema.sections[0] ??
    null;
  const selectedField =
    section?.fields.find((field) => field.id === selectedFieldId) ?? null;

  function updateSchema(next: CustomFormSchema) {
    setSchema(next);
  }

  function updateSection(sectionId: string, patch: Partial<CustomSection>) {
    updateSchema({
      version: 1,
      sections: schema.sections.map((item) =>
        item.id === sectionId ? { ...item, ...patch } : item,
      ),
    });
  }

  function updateField(sectionId: string, fieldId: string, patch: Partial<CustomField>) {
    updateSchema({
      version: 1,
      sections: schema.sections.map((item) =>
        item.id === sectionId
          ? {
              ...item,
              fields: item.fields.map((field) =>
                field.id === fieldId ? { ...field, ...patch } : field,
              ),
            }
          : item,
      ),
    });
  }

  function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= schema.sections.length) return;
    const sections = [...schema.sections];
    const [item] = sections.splice(index, 1);
    if (!item) return;
    sections.splice(target, 0, item);
    updateSchema({ version: 1, sections });
  }

  function moveField(index: number, dir: -1 | 1) {
    if (!section) return;
    const target = index + dir;
    if (target < 0 || target >= section.fields.length) return;
    const fields = [...section.fields];
    const [item] = fields.splice(index, 1);
    if (!item) return;
    fields.splice(target, 0, item);
    updateSection(section.id, { fields });
  }

  const gateCandidates = useMemo(
    () => gateFieldCandidates(schema, selectedField?.id),
    [schema, selectedField?.id],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/projects/forms"
          className="text-sm font-medium text-action hover:underline"
        >
          ← {t("backToCatalog")}
        </Link>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={tab === "build" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("build")}
          >
            {t("buildTab")}
          </Button>
          <Button
            type="button"
            variant={tab === "preview" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("preview")}
          >
            {t("previewTab")}
          </Button>
        </div>
      </div>

      <form action={action} className="space-y-4">
        <input type="hidden" name="locale" value={locale} />
        {templateId ? (
          <input type="hidden" name="templateId" value={templateId} />
        ) : null}
        <input type="hidden" name="schema" value={JSON.stringify(schema)} />

        <FieldGrid columns={2}>
          <Field>
            <FieldLabel htmlFor="customFormTitle" required>
              {t("title")}
            </FieldLabel>
            <Input
              id="customFormTitle"
              name="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              maxLength={120}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="customFormDescription">{t("description")}</FieldLabel>
            <Input
              id="customFormDescription"
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={500}
            />
          </Field>
        </FieldGrid>

        {tab === "preview" ? (
          <div className="rounded-xl border border-border bg-surface p-5">
            <CustomQuestionnaire
              schema={schema}
              answers={previewAnswers}
              onChange={setPreviewAnswers}
              locale={locale}
              showSave={false}
            />
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
            <aside className="space-y-3 rounded-xl border border-border bg-surface p-3">
              <p className="text-xs font-semibold text-muted-foreground">
                {t("sections")}
              </p>
              <ul className="space-y-1">
                {schema.sections.map((item, index) => (
                  <li key={item.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSectionId(item.id);
                        setSelectedFieldId(null);
                      }}
                      className={cn(
                        "min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left text-sm",
                        item.id === section?.id
                          ? "bg-action/10 font-medium text-brand"
                          : "text-muted-foreground hover:bg-canvas",
                      )}
                    >
                      {localizedLabel(item.title, locale) || t("untitledSection")}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => moveSection(index, -1)}
                    >
                      <ArrowUp className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => moveSection(index, 1)}
                    >
                      <ArrowDown className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const next = emptySection(schema);
                  updateSchema({
                    version: 1,
                    sections: [...schema.sections, next],
                  });
                  setSelectedSectionId(next.id);
                }}
              >
                <Plus className="size-4" />
                {t("addSection")}
              </Button>
              <Field>
                <FieldLabel htmlFor="insertModule">{t("insertModule")}</FieldLabel>
                <NativeSelect
                  id="insertModule"
                  density="dense"
                  defaultValue=""
                  onChange={(event) => {
                    const id = event.target.value as CustomFormModuleId;
                    if (!id) return;
                    const next = insertModuleIntoSchema(schema, id);
                    updateSchema(next);
                    setSelectedSectionId(
                      next.sections[next.sections.length - 1]?.id ?? "",
                    );
                    event.target.value = "";
                  }}
                >
                  <option value="">{t("chooseModule")}</option>
                  {CUSTOM_FORM_MODULES.map((mod) => (
                    <option key={mod.id} value={mod.id}>
                      {localizedLabel(mod.title, locale)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </aside>

            <div className="space-y-3 rounded-xl border border-border bg-surface p-4">
              {section ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="sectionTitle">{t("sectionTitle")}</FieldLabel>
                    <Input
                      id="sectionTitle"
                      value={section.title.en}
                      onChange={(event) =>
                        updateSection(section.id, {
                          title: { ...section.title, en: event.target.value },
                        })
                      }
                    />
                  </Field>
                  <FieldGrid columns={2}>
                    <Field>
                      <FieldLabel htmlFor="sectionTitleFr">{t("labelFr")}</FieldLabel>
                      <Input
                        id="sectionTitleFr"
                        value={section.title.fr ?? ""}
                        onChange={(event) =>
                          updateSection(section.id, {
                            title: { ...section.title, fr: event.target.value },
                          })
                        }
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="sectionTitleEs">{t("labelEs")}</FieldLabel>
                      <Input
                        id="sectionTitleEs"
                        value={section.title.es ?? ""}
                        onChange={(event) =>
                          updateSection(section.id, {
                            title: { ...section.title, es: event.target.value },
                          })
                        }
                      />
                    </Field>
                  </FieldGrid>
                  <ShowWhenEditor
                    locale={locale}
                    candidates={gateCandidates}
                    value={section.showWhen as ShowWhen | undefined}
                    onChange={(showWhen) => updateSection(section.id, { showWhen })}
                  />
                  <ul className="space-y-2">
                    {section.fields.map((field, index) => (
                      <li
                        key={field.id}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2",
                          field.id === selectedFieldId
                            ? "border-action"
                            : "border-border",
                        )}
                      >
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left text-sm"
                          onClick={() => setSelectedFieldId(field.id)}
                        >
                          <span className="font-medium text-brand">
                            {localizedLabel(field.label, locale)}
                          </span>
                          <span className="ml-2 text-xs text-muted-foreground">
                            {t(`types.${field.type}`)}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveField(index, -1)}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => moveField(index, 1)}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            updateSection(section.id, {
                              fields: section.fields.filter((item) => item.id !== field.id),
                            });
                            if (selectedFieldId === field.id) setSelectedFieldId(null);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const next = emptyField(schema);
                      updateSection(section.id, {
                        fields: [...section.fields, next],
                      });
                      setSelectedFieldId(next.id);
                    }}
                  >
                    <Plus className="size-4" />
                    {t("addQuestion")}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => {
                      updateSchema({
                        version: 1,
                        sections: schema.sections.filter((item) => item.id !== section.id),
                      });
                      setSelectedSectionId(schema.sections[0]?.id ?? "");
                    }}
                  >
                    {t("deleteSection")}
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t("noSections")}</p>
              )}
            </div>

            <aside className="space-y-3 rounded-xl border border-border bg-surface p-3">
              {section && selectedField ? (
                <FieldInspector
                  locale={locale}
                  field={selectedField}
                  candidates={gateCandidates}
                  onChange={(patch) => updateField(section.id, selectedField.id, patch)}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t("selectQuestion")}</p>
              )}
            </aside>
          </div>
        )}

        {state.error ? (
          <p className="text-sm text-destructive">
            {t(`errors.${state.error}`)}
          </p>
        ) : state.message === "saved" ? (
          <p className="text-sm text-success">{t("saved")}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? t("saving") : t("save")}
          </Button>
          <Link
            href="/projects/forms"
            className={cn(buttonVariants({ variant: "outline" }))}
          >
            {t("cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}

function ShowWhenEditor({
  locale,
  candidates,
  value,
  onChange,
}: {
  locale: string;
  candidates: CustomField[];
  value?: ShowWhen | ShowWhen[];
  onChange: (rule: ShowWhen | undefined) => void;
}) {
  const t = useTranslations("customForms");
  const clause: ShowWhen | undefined = Array.isArray(value) ? value[0] : value;
  const selected = candidates.find((field) => field.key === clause?.key);
  return (
    <Field>
      <FieldLabel htmlFor="showWhenField">{t("showWhen")}</FieldLabel>
      <FieldHint>{t("showWhenHelp")}</FieldHint>
      <NativeSelect
        id="showWhenField"
        density="dense"
        value={clause?.key ?? ""}
        onChange={(event) => {
          const key = event.target.value;
          if (!key) {
            onChange(undefined);
            return;
          }
          onChange({ key, equals: "Y" });
        }}
      >
        <option value="">{t("alwaysVisible")}</option>
        {candidates.map((field) => (
          <option key={field.id} value={field.key}>
            {localizedLabel(field.label, locale)}
          </option>
        ))}
      </NativeSelect>
      {selected && selected.type === "yesno" ? (
        <NativeSelect
          className="mt-2"
          density="dense"
          value={clause?.equals ?? "Y"}
          onChange={(event) =>
            onChange(clause ? { ...clause, equals: event.target.value } : undefined)
          }
        >
          <option value="Y">{t("equalsYes")}</option>
          <option value="N">{t("equalsNo")}</option>
        </NativeSelect>
      ) : null}
      {selected && selected.type === "select" ? (
        <NativeSelect
          className="mt-2"
          density="dense"
          value={clause?.equals ?? selected.options?.[0]?.value ?? ""}
          onChange={(event) =>
            onChange(clause ? { ...clause, equals: event.target.value } : undefined)
          }
        >
          {(selected.options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {localizedLabel(opt.label, locale)}
            </option>
          ))}
        </NativeSelect>
      ) : null}
    </Field>
  );
}

function FieldInspector({
  locale,
  field,
  candidates,
  onChange,
}: {
  locale: string;
  field: CustomField;
  candidates: CustomField[];
  onChange: (patch: Partial<CustomField>) => void;
}) {
  const t = useTranslations("customForms");
  const optionsText = (field.options ?? [])
    .map((opt) => `${opt.value}|${opt.label.en}`)
    .join("\n");

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-muted-foreground">{t("question")}</p>
      <Field>
        <FieldLabel htmlFor="fieldLabel" required>
          {t("labelEn")}
        </FieldLabel>
        <Input
          id="fieldLabel"
          value={field.label.en}
          onChange={(event) => {
            const en = event.target.value;
            onChange({
              label: { ...field.label, en },
              key: field.key.startsWith("question")
                ? slugFromLabel(en) || field.key
                : field.key,
            });
          }}
        />
      </Field>
      <FieldGrid columns={2}>
        <Field>
          <FieldLabel htmlFor="fieldLabelFr">{t("labelFr")}</FieldLabel>
          <Input
            id="fieldLabelFr"
            value={field.label.fr ?? ""}
            onChange={(event) =>
              onChange({ label: { ...field.label, fr: event.target.value } })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="fieldLabelEs">{t("labelEs")}</FieldLabel>
          <Input
            id="fieldLabelEs"
            value={field.label.es ?? ""}
            onChange={(event) =>
              onChange({ label: { ...field.label, es: event.target.value } })
            }
          />
        </Field>
      </FieldGrid>
      <Field>
        <FieldLabel htmlFor="fieldType">{t("fieldType")}</FieldLabel>
        <NativeSelect
          id="fieldType"
          density="dense"
          value={field.type}
          onChange={(event) =>
            onChange({ type: event.target.value as CustomFieldType })
          }
        >
          {CUSTOM_FORM_FIELD_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`types.${type}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <label className="flex items-center gap-2 text-sm text-brand">
        <input
          type="checkbox"
          checked={Boolean(field.required)}
          onChange={(event) => onChange({ required: event.target.checked })}
          className="size-4 rounded border-border"
        />
        {t("required")}
      </label>
      {field.type === "select" ? (
        <Field>
          <FieldLabel htmlFor="fieldOptions">{t("options")}</FieldLabel>
          <FieldHint>{t("optionsHelp")}</FieldHint>
          <Textarea
            id="fieldOptions"
            density="dense"
            rows={5}
            value={optionsText}
            onChange={(event) => {
              const options = event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean)
                .map((line) => {
                  const [value, ...rest] = line.split("|");
                  const label = rest.join("|").trim() || value || "";
                  return {
                    value: (value || slugFromLabel(label)).slice(0, 80),
                    label: text(label),
                  };
                });
              onChange({ options });
            }}
          />
        </Field>
      ) : null}
      <ShowWhenEditor
        locale={locale}
        candidates={candidates}
        value={field.showWhen as ShowWhen | undefined}
        onChange={(showWhen) => onChange({ showWhen })}
      />
    </div>
  );
}
