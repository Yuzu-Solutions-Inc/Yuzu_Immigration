"use client";

import { useActionState, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";

import {
  deleteOrganizationProgramAction,
  createOrganizationProgramAction,
  updateOrganizationProgramAction,
  type OrgProgramActionState,
} from "@/app/actions/org-programs";
import { Button, buttonVariants } from "@/components/ui/button";
import { Field, FieldHint, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  defaultOrgProgramDraft,
  PROPOSED_ORG_PROGRAM_DOC_KEYS,
  PROPOSED_ORG_PROGRAM_FORM_CODES,
  type OrganizationProgramDraftInput,
  type OrgProgramDocumentSeed,
  type OrgProgramFormSeed,
} from "@/lib/crm/org-programs";
import { formTitle, type FormCode } from "@/lib/ircc/catalog";

const initialState: OrgProgramActionState = {};

type DraftDoc = OrgProgramDocumentSeed & { localId: string };
type DraftForm = OrgProgramFormSeed & { localId: string };

function newLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toDraftForms(forms: OrgProgramFormSeed[]): DraftForm[] {
  return forms.map((form) => ({ ...form, localId: newLocalId() }));
}

function toDraftDocs(docs: OrgProgramDocumentSeed[]): DraftDoc[] {
  return docs.map((doc) => ({ ...doc, localId: newLocalId() }));
}

export function OrganizationProgramForm({
  locale,
  mode,
  programId,
  initial,
  cancelHref = "/projects/templates",
}: {
  locale: string;
  mode: "create" | "edit";
  programId?: string;
  initial?: OrganizationProgramDraftInput | null;
  cancelHref?: string;
}) {
  const t = useTranslations("orgPrograms");
  const isEdit = mode === "edit";
  const defaults = useMemo(() => defaultOrgProgramDraft(), []);
  const seed = initial ?? {
    name: "",
    allows_individual: true,
    allows_couple: true,
    allows_family: true,
    allows_inside_canada: true,
    allows_outside_canada: true,
    forms: defaults.forms,
    documents: defaults.documents,
  };

  const [name, setName] = useState(seed.name);
  const [allowsIndividual, setAllowsIndividual] = useState(
    seed.allows_individual,
  );
  const [allowsCouple, setAllowsCouple] = useState(seed.allows_couple);
  const [allowsFamily, setAllowsFamily] = useState(seed.allows_family);
  const [allowsInside, setAllowsInside] = useState(seed.allows_inside_canada);
  const [allowsOutside, setAllowsOutside] = useState(
    seed.allows_outside_canada,
  );
  const [forms, setForms] = useState<DraftForm[]>(() =>
    toDraftForms(seed.forms.length ? seed.forms : defaults.forms),
  );
  const [documents, setDocuments] = useState<DraftDoc[]>(() =>
    toDraftDocs(seed.documents.length ? seed.documents : defaults.documents),
  );
  const [customLabel, setCustomLabel] = useState("");
  const [customScope, setCustomScope] = useState<"person" | "project">("person");

  const [createState, createAction, createPending] = useActionState(
    createOrganizationProgramAction,
    initialState,
  );
  const [updateState, updateAction, updatePending] = useActionState(
    updateOrganizationProgramAction,
    initialState,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteOrganizationProgramAction,
    initialState,
  );

  const pending = createPending || updatePending || deletePending;
  const state = isEdit ? updateState : createState;
  const formLocale = locale === "fr" ? "fr" : locale === "es" ? "es" : "en";
  const selectedFormCodes = useMemo(
    () => new Set(forms.map((f) => f.formCode)),
    [forms],
  );

  function toggleForm(code: FormCode) {
    setForms((prev) => {
      if (prev.some((f) => f.formCode === code)) {
        return prev.filter((f) => f.formCode !== code);
      }
      return [
        ...prev,
        {
          localId: newLocalId(),
          formCode: code,
          isRequired: true,
          sortOrder: (prev.length + 1) * 10,
        },
      ];
    });
  }

  function toggleProposedDoc(docKey: "passport" | "photo") {
    setDocuments((prev) => {
      if (prev.some((d) => d.docKey === docKey)) {
        return prev.filter((d) => d.docKey !== docKey);
      }
      return [
        ...prev,
        {
          localId: newLocalId(),
          docKey,
          customLabel: null,
          scope: "person",
          isRequired: true,
          sortOrder: (prev.length + 1) * 10,
        },
      ];
    });
  }

  function addCustomDoc() {
    const label = customLabel.trim();
    if (!label) return;
    setDocuments((prev) => [
      ...prev,
      {
        localId: newLocalId(),
        docKey: "custom",
        customLabel: label,
        scope: customScope,
        isRequired: true,
        sortOrder: (prev.length + 1) * 10,
      },
    ]);
    setCustomLabel("");
  }

  function updateDocScope(localId: string, scope: "person" | "project") {
    setDocuments((prev) =>
      prev.map((doc) => (doc.localId === localId ? { ...doc, scope } : doc)),
    );
  }

  function removeDoc(localId: string) {
    setDocuments((prev) => prev.filter((doc) => doc.localId !== localId));
  }

  const errorKey = state.error || deleteState.error;

  return (
    <form
      action={isEdit ? updateAction : createAction}
      className="space-y-6"
    >
      <input type="hidden" name="locale" value={locale} />
      {isEdit && programId ? (
        <input type="hidden" name="programId" value={programId} />
      ) : null}
      <input
        type="hidden"
        name="forms"
        value={JSON.stringify(forms.map(({ localId: _id, ...form }) => form))}
      />
      <input
        type="hidden"
        name="documents"
        value={JSON.stringify(
          documents.map(({ localId: _id, ...doc }) => doc),
        )}
      />
      {allowsIndividual ? (
        <input type="hidden" name="allowsIndividual" value="on" />
      ) : null}
      {allowsCouple ? (
        <input type="hidden" name="allowsCouple" value="on" />
      ) : null}
      {allowsFamily ? (
        <input type="hidden" name="allowsFamily" value="on" />
      ) : null}
      {allowsInside ? (
        <input type="hidden" name="allowsInsideCanada" value="on" />
      ) : null}
      {allowsOutside ? (
        <input type="hidden" name="allowsOutsideCanada" value="on" />
      ) : null}

      <Field>
        <FieldLabel htmlFor="orgProgramName" required>
          {t("name")}
        </FieldLabel>
        <Input
          id="orgProgramName"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
          placeholder={t("namePlaceholder")}
        />
      </Field>

      <Field>
        <FieldLabel>{t("composition")}</FieldLabel>
        <FieldHint>{t("compositionHelp")}</FieldHint>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["individual", allowsIndividual, setAllowsIndividual],
              ["couple", allowsCouple, setAllowsCouple],
              ["family", allowsFamily, setAllowsFamily],
            ] as const
          ).map(([key, checked, setChecked]) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-brand"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="size-4 rounded border-border"
              />
              {t(`compositions.${key}`)}
            </label>
          ))}
        </div>
      </Field>

      <Field>
        <FieldLabel>{t("location")}</FieldLabel>
        <FieldHint>{t("locationHelp")}</FieldHint>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-sm text-brand">
            <input
              type="checkbox"
              checked={allowsOutside}
              onChange={(e) => setAllowsOutside(e.target.checked)}
              className="size-4 rounded border-border"
            />
            {t("outsideCanada")}
          </label>
          <label className="flex items-center gap-2 text-sm text-brand">
            <input
              type="checkbox"
              checked={allowsInside}
              onChange={(e) => setAllowsInside(e.target.checked)}
              className="size-4 rounded border-border"
            />
            {t("insideCanada")}
          </label>
        </div>
      </Field>

      <Field>
        <FieldLabel>{t("forms")}</FieldLabel>
        <FieldHint>{t("formsHelp")}</FieldHint>
        <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border bg-canvas p-4">
          {PROPOSED_ORG_PROGRAM_FORM_CODES.map((code) => (
            <label
              key={code}
              className="flex items-start gap-2 text-sm text-brand"
            >
              <input
                type="checkbox"
                checked={selectedFormCodes.has(code)}
                onChange={() => toggleForm(code)}
                className="mt-0.5 size-4 rounded border-border"
              />
              <span>
                <span className="font-medium uppercase">{code}</span>
                <span className="block text-xs text-muted-foreground">
                  {formTitle(code, formLocale)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </Field>

      <div className="space-y-3">
        <Field>
          <FieldLabel>{t("documents")}</FieldLabel>
          <FieldHint>{t("documentsHelp")}</FieldHint>
        </Field>

        <div className="space-y-2 rounded-xl border border-border bg-canvas p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("proposedDocuments")}
          </p>
          {PROPOSED_ORG_PROGRAM_DOC_KEYS.map((docKey) => {
            const existing = documents.find((d) => d.docKey === docKey);
            return (
              <div
                key={docKey}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <label className="flex items-center gap-2 text-brand">
                  <input
                    type="checkbox"
                    checked={Boolean(existing)}
                    onChange={() => toggleProposedDoc(docKey)}
                    className="size-4 rounded border-border"
                  />
                  {t(`docKeys.${docKey}`)}
                </label>
                {existing ? (
                  <NativeSelect
                    density="dense"
                    className="w-auto text-xs"
                    value={existing.scope}
                    onChange={(e) =>
                      updateDocScope(
                        existing.localId,
                        e.target.value === "project" ? "project" : "person",
                      )
                    }
                  >
                    <option value="person">{t("scopePerson")}</option>
                    <option value="project">{t("scopeProject")}</option>
                  </NativeSelect>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 rounded-xl border border-border bg-canvas p-4">
          <p className="text-xs font-medium text-muted-foreground">
            {t("customDocuments")}
          </p>
          {documents
            .filter((d) => d.docKey === "custom")
            .map((doc) => (
              <div
                key={doc.localId}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span className="min-w-0 flex-1 font-medium text-brand">
                  {doc.customLabel}
                </span>
                <NativeSelect
                  density="dense"
                  className="w-auto text-xs"
                  value={doc.scope}
                  onChange={(e) =>
                    updateDocScope(
                      doc.localId,
                      e.target.value === "project" ? "project" : "person",
                    )
                  }
                >
                  <option value="person">{t("scopePerson")}</option>
                  <option value="project">{t("scopeProject")}</option>
                </NativeSelect>
                <button
                  type="button"
                  onClick={() => removeDoc(doc.localId)}
                  className="text-destructive hover:underline"
                  aria-label={t("removeDocument")}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          <div className="flex flex-wrap gap-2">
            <Input
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder={t("customLabelPlaceholder")}
              maxLength={120}
              className="min-w-[10rem] flex-1 rounded-xl"
            />
            <NativeSelect
              className="w-auto"
              value={customScope}
              onChange={(e) =>
                setCustomScope(
                  e.target.value === "project" ? "project" : "person",
                )
              }
            >
              <option value="person">{t("scopePerson")}</option>
              <option value="project">{t("scopeProject")}</option>
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              onClick={addCustomDoc}
              disabled={!customLabel.trim()}
            >
              <Plus className="size-4" />
              {t("addCustomDocument")}
            </Button>
          </div>
        </div>
      </div>

      {errorKey ? (
        <p className="text-sm text-destructive">{t(`errors.${errorKey}`)}</p>
      ) : null}

      <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        {isEdit && programId ? (
          <Button
            type="submit"
            formAction={deleteAction}
            variant="outline"
            disabled={pending}
            className="text-destructive"
            onClick={(event) => {
              if (!window.confirm(t("deleteConfirm", { name: name.trim() || "—" }))) {
                event.preventDefault();
              }
            }}
          >
            {deletePending ? t("deleting") : t("delete")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row">
          <Link
            href={cancelHref}
            className={cn(
              buttonVariants({ variant: "outline" }),
              pending && "pointer-events-none opacity-50",
            )}
          >
            {t("cancel")}
          </Link>
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? t("saving") : isEdit ? t("save") : t("create")}
          </Button>
        </div>
      </div>
    </form>
  );
}
