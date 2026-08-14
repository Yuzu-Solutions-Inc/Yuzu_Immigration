"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";

import {
  archiveOrganizationProgramAction,
  createOrganizationProgramAction,
  updateOrganizationProgramAction,
  type OrgProgramActionState,
} from "@/app/actions/org-programs";
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
import {
  defaultOrgProgramDraft,
  PROPOSED_ORG_PROGRAM_DOC_KEYS,
  PROPOSED_ORG_PROGRAM_FORM_CODES,
  type OrganizationProgram,
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

export function OrganizationProgramEditor({
  locale,
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  locale: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: OrganizationProgram | null;
  onSaved?: (program: OrganizationProgram) => void;
}) {
  const t = useTranslations("orgPrograms");
  const isEdit = Boolean(initial);
  const defaults = useMemo(() => defaultOrgProgramDraft(), []);

  const [name, setName] = useState(initial?.name ?? "");
  const [allowsIndividual, setAllowsIndividual] = useState(
    initial?.allows_individual ?? true,
  );
  const [allowsCouple, setAllowsCouple] = useState(
    initial?.allows_couple ?? true,
  );
  const [allowsFamily, setAllowsFamily] = useState(
    initial?.allows_family ?? true,
  );
  const [allowsInside, setAllowsInside] = useState(
    initial?.allows_inside_canada ?? true,
  );
  const [allowsOutside, setAllowsOutside] = useState(
    initial?.allows_outside_canada ?? true,
  );
  const [forms, setForms] = useState<DraftForm[]>(() =>
    toDraftForms(initial?.forms?.length ? initial.forms : defaults.forms),
  );
  const [documents, setDocuments] = useState<DraftDoc[]>(() =>
    toDraftDocs(
      initial?.documents?.length ? initial.documents : defaults.documents,
    ),
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
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveOrganizationProgramAction,
    initialState,
  );

  const pending = createPending || updatePending || archivePending;
  const state = isEdit ? updateState : createState;
  const formLocale = locale === "fr" ? "fr" : locale === "es" ? "es" : "en";

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setAllowsIndividual(initial?.allows_individual ?? true);
    setAllowsCouple(initial?.allows_couple ?? true);
    setAllowsFamily(initial?.allows_family ?? true);
    setAllowsInside(initial?.allows_inside_canada ?? true);
    setAllowsOutside(initial?.allows_outside_canada ?? true);
    setForms(
      toDraftForms(initial?.forms?.length ? initial.forms : defaults.forms),
    );
    setDocuments(
      toDraftDocs(
        initial?.documents?.length ? initial.documents : defaults.documents,
      ),
    );
    setCustomLabel("");
    setCustomScope("person");
  }, [open, initial, defaults]);

  useEffect(() => {
    const programId = createState.programId || updateState.programId;
    const saved =
      createState.message === "created" || updateState.message === "saved";
    if (!programId || !saved) return;

    onSaved?.({
      id: programId,
      organization_id: initial?.organization_id ?? "",
      name: name.trim(),
      allows_individual: allowsIndividual,
      allows_couple: allowsCouple,
      allows_family: allowsFamily,
      allows_inside_canada: allowsInside,
      allows_outside_canada: allowsOutside,
      forms: forms.map(({ localId: _id, ...form }) => form),
      documents: documents.map(({ localId: _id, ...doc }) => doc),
      is_active: true,
      sort_order: initial?.sort_order ?? 0,
      created_by: initial?.created_by ?? null,
      created_at: initial?.created_at ?? "",
      updated_at: initial?.updated_at ?? "",
    });
    onOpenChange(false);
    // Draft fields are read from the render where the action completed.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to save completion
  }, [
    createState.message,
    createState.programId,
    updateState.message,
    updateState.programId,
  ]);

  useEffect(() => {
    if (archiveState.message === "archived") {
      onOpenChange(false);
    }
  }, [archiveState, onOpenChange]);

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

  const errorKey = state.error || archiveState.error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("editTitle") : t("createTitle")}
          </DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <form
          action={isEdit ? updateAction : createAction}
          className="space-y-5"
        >
          <input type="hidden" name="locale" value={locale} />
          {isEdit ? (
            <input type="hidden" name="programId" value={initial!.id} />
          ) : null}
          <input
            type="hidden"
            name="forms"
            value={JSON.stringify(
              forms.map(({ localId: _id, ...form }) => form),
            )}
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

          <div className="space-y-2">
            <Label htmlFor="orgProgramName">{t("name")}</Label>
            <Input
              id="orgProgramName"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              required
              className="rounded-xl"
              placeholder={t("namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("composition")}</Label>
            <p className="text-xs text-muted-foreground">{t("compositionHelp")}</p>
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
          </div>

          <div className="space-y-2">
            <Label>{t("location")}</Label>
            <p className="text-xs text-muted-foreground">{t("locationHelp")}</p>
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
          </div>

          <div className="space-y-2">
            <Label>{t("forms")}</Label>
            <p className="text-xs text-muted-foreground">{t("formsHelp")}</p>
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border bg-canvas p-3">
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
          </div>

          <div className="space-y-3">
            <div>
              <Label>{t("documents")}</Label>
              <p className="text-xs text-muted-foreground">{t("documentsHelp")}</p>
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-canvas p-3">
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
                      <select
                        value={existing.scope}
                        onChange={(e) =>
                          updateDocScope(
                            existing.localId,
                            e.target.value === "project" ? "project" : "person",
                          )
                        }
                        className="h-8 rounded-lg border border-input bg-surface px-2 text-xs"
                      >
                        <option value="person">{t("scopePerson")}</option>
                        <option value="project">{t("scopeProject")}</option>
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 rounded-xl border border-border bg-canvas p-3">
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
                    <select
                      value={doc.scope}
                      onChange={(e) =>
                        updateDocScope(
                          doc.localId,
                          e.target.value === "project" ? "project" : "person",
                        )
                      }
                      className="h-8 rounded-lg border border-input bg-surface px-2 text-xs"
                    >
                      <option value="person">{t("scopePerson")}</option>
                      <option value="project">{t("scopeProject")}</option>
                    </select>
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
                <select
                  value={customScope}
                  onChange={(e) =>
                    setCustomScope(
                      e.target.value === "project" ? "project" : "person",
                    )
                  }
                  className="h-10 rounded-xl border border-input bg-surface px-2 text-sm"
                >
                  <option value="person">{t("scopePerson")}</option>
                  <option value="project">{t("scopeProject")}</option>
                </select>
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

          <DialogFooter className="gap-2 sm:justify-between">
            {isEdit ? (
              <Button
                type="submit"
                formAction={archiveAction}
                variant="outline"
                disabled={pending}
                className="text-destructive"
              >
                {archivePending ? t("archiving") : t("archive")}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={pending || !name.trim()}>
                {pending
                  ? t("saving")
                  : isEdit
                    ? t("save")
                    : t("create")}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationProgramManageButton({
  onClick,
}: {
  onClick: () => void;
}) {
  const t = useTranslations("orgPrograms");
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-action hover:underline"
    >
      <Pencil className="size-3.5" />
      {t("edit")}
    </button>
  );
}
