"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createProjectAction,
  updateProjectAction,
  type ProjectActionState,
} from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";
import type {
  ParticipantRole,
  PersonImmigrationStatus,
  ProgramFamily,
  ProjectJurisdiction,
  ProjectStatus,
} from "@/db/schema";
import {
  PERMIT_PROGRAM_FAMILIES,
  SELECTABLE_PROGRAM_FAMILIES,
  defaultRolesForComposition,
  type ProjectComposition,
} from "@/lib/crm/programs";
import {
  compositionAllowed,
  orgProgramSelectValue,
  parseOrgProgramSelectValue,
  resolveOrgProgramApplicationLocation,
  type OrganizationProgram,
} from "@/lib/crm/org-programs";
import {
  defaultApplicationLocation,
  isCustomProgram,
  isFederalPermitProgram,
  isPermitKitFamily,
  isStudyPermitProgram,
  type ApplicationLocation,
  type PermitKitFamily,
} from "@/lib/ircc/kits";
import {
  PERSON_IMMIGRATION_STATUSES,
  personStatusAllowsExpiry,
} from "@/lib/crm/person-status";
import { PROJECT_STATUSES, todayDateInputValue } from "@/lib/crm/statuses";

type ExistingPerson = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

type OrgMemberOption = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

export type ProjectFormSlot = {
  role: ParticipantRole;
  mode: "new" | "existing";
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
  immigrationStatus: PersonImmigrationStatus;
  statusExpiresAt: string;
  programFamily: PermitKitFamily;
  applicationLocation: ApplicationLocation;
  needsCustodian: boolean;
};

export type ProjectFormInitial = {
  projectId: string;
  title: string;
  description: string;
  notes?: string;
  status: ProjectStatus;
  statusAt: string;
  submitBefore: string;
  composition: ProjectComposition;
  programFamily: ProgramFamily;
  organizationProgramId?: string;
  jurisdiction: ProjectJurisdiction;
  formLanguage: "en" | "fr";
  representativeUserId: string;
  applicationLocation?: ApplicationLocation;
  isCommonLaw?: boolean;
  needsCustodian?: boolean;
  slots: ProjectFormSlot[];
};

const initialState: ProjectActionState = {};

function emptySlot(
  role: ParticipantRole,
  kit?: Partial<
    Pick<
      ProjectFormSlot,
      "programFamily" | "applicationLocation" | "needsCustodian" | "mode"
    >
  >,
): ProjectFormSlot {
  return {
    role,
    mode: kit?.mode ?? "new",
    personId: "",
    firstName: "",
    lastName: "",
    email: "",
    immigrationStatus: "none",
    statusExpiresAt: "",
    programFamily: kit?.programFamily ?? "work_permit",
    applicationLocation: kit?.applicationLocation ?? "outside",
    needsCustodian: kit?.needsCustodian ?? false,
  };
}

export function ProjectForm({
  locale,
  people,
  members,
  currentUserId,
  presetPersonId,
  initial,
  canCreatePeople = true,
  organizationPrograms = [],
}: {
  locale: string;
  people: ExistingPerson[];
  members: OrgMemberOption[];
  currentUserId?: string;
  presetPersonId?: string;
  initial?: ProjectFormInitial;
  canCreatePeople?: boolean;
  organizationPrograms?: OrganizationProgram[];
}) {
  const t = useTranslations("projects");
  const tp = useTranslations("programs");
  const to = useTranslations("orgPrograms");
  const tr = useTranslations("roles");
  const ti = useTranslations("immigrationStatus");
  const isEdit = Boolean(initial);
  const defaultPersonMode: "new" | "existing" = canCreatePeople
    ? "new"
    : "existing";

  const [orgPrograms, setOrgPrograms] = useState(organizationPrograms);

  const [composition, setComposition] = useState<ProjectComposition>(
    initial?.composition ?? "individual",
  );
  const [programFamily, setProgramFamily] = useState<ProgramFamily>(
    initial?.programFamily ?? "work_permit",
  );
  const [organizationProgramId, setOrganizationProgramId] = useState<
    string | null
  >(initial?.organizationProgramId ?? null);
  const [formLanguage, setFormLanguage] = useState<"en" | "fr">(
    initial?.formLanguage ?? (locale === "fr" ? "fr" : "en"),
  );
  const [status, setStatus] = useState<ProjectStatus>(
    initial?.status ?? "new",
  );
  const [statusAt, setStatusAt] = useState(
    initial?.statusAt ?? todayDateInputValue(),
  );
  const [submitBefore, setSubmitBefore] = useState(
    initial?.submitBefore ?? "",
  );
  const [representativeUserId, setRepresentativeUserId] = useState(
    initial?.representativeUserId ||
      currentUserId ||
      members[0]?.user_id ||
      "",
  );
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [applicationLocation, setApplicationLocation] =
    useState<ApplicationLocation>(
      initial?.applicationLocation ??
        defaultApplicationLocation(initial?.programFamily ?? "work_permit"),
    );
  const [isCommonLaw, setIsCommonLaw] = useState(
    initial?.isCommonLaw ?? false,
  );
  const [needsCustodian, setNeedsCustodian] = useState(
    initial?.needsCustodian ?? false,
  );
  const selectedOrgProgram = useMemo(
    () =>
      organizationProgramId
        ? (orgPrograms.find((p) => p.id === organizationProgramId) ?? null)
        : null,
    [orgPrograms, organizationProgramId],
  );
  const customFile = isCustomProgram(programFamily, organizationProgramId);
  const programSelectValue = organizationProgramId
    ? orgProgramSelectValue(organizationProgramId)
    : programFamily;
  const [slots, setSlots] = useState<ProjectFormSlot[]>(
    initial?.slots?.length ? initial.slots : [emptySlot("principal", { mode: defaultPersonMode })],
  );
  const skipJurisdictionSync = useRef(Boolean(initial));
  const compositionInitialized = useRef(false);

  const action = isEdit ? updateProjectAction : createProjectAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  useEffect(() => {
    if (!compositionInitialized.current) {
      compositionInitialized.current = true;
      if (initial?.slots?.length) return;
    }

    const roles = defaultRolesForComposition(composition);
    setSlots((prev) =>
      roles.map((role, index) => {
        const existing = prev[index];
        if (existing) {
          return { ...existing, role };
        }
        if (index === 0 && presetPersonId && !isEdit) {
          const person = people.find((p) => p.id === presetPersonId);
          if (person) {
            return {
              ...emptySlot(role, { applicationLocation, mode: defaultPersonMode }),
              mode: "existing" as const,
              personId: person.id,
              firstName: person.first_name,
              lastName: person.last_name,
              email: person.email ?? "",
            };
          }
        }
        return emptySlot(role, { applicationLocation, mode: defaultPersonMode });
      }),
    );
  }, [
    composition,
    people,
    presetPersonId,
    isEdit,
    initial?.slots?.length,
    applicationLocation,
    defaultPersonMode,
  ]);

  useEffect(() => {
    setOrgPrograms(organizationPrograms);
  }, [organizationPrograms]);

  useEffect(() => {
    if (!selectedOrgProgram) return;
    if (!compositionAllowed(selectedOrgProgram, composition)) {
      if (selectedOrgProgram.allows_individual) setComposition("individual");
      else if (selectedOrgProgram.allows_couple) setComposition("couple");
      else if (selectedOrgProgram.allows_family) setComposition("family");
    }
    const nextLocation = resolveOrgProgramApplicationLocation(
      selectedOrgProgram,
      applicationLocation,
    );
    if (nextLocation && nextLocation !== applicationLocation) {
      setApplicationLocation(nextLocation);
    }
  }, [selectedOrgProgram, composition, applicationLocation]);

  useEffect(() => {
    if (skipJurisdictionSync.current) {
      skipJurisdictionSync.current = false;
      return;
    }
    if (!isEdit && !organizationProgramId) {
      setApplicationLocation(defaultApplicationLocation(programFamily));
    }
  }, [programFamily, isEdit, organizationProgramId]);

  function handleProgramSelectChange(value: string) {
    const parsed = parseOrgProgramSelectValue(value);
    if (parsed.kind === "org") {
      setOrganizationProgramId(parsed.id);
      setProgramFamily("other");
      return;
    }
    setOrganizationProgramId(null);
    setProgramFamily(parsed.family as ProgramFamily);
  }

  const participantsPayload = useMemo(
    () =>
      slots.map((slot) => {
        const kit = customFile
          ? {
              programFamily: slot.programFamily,
              applicationLocation: slot.applicationLocation,
              needsCustodian: slot.needsCustodian ? ("Y" as const) : ("N" as const),
            }
          : {};
        return slot.mode === "existing" && slot.personId
          ? { personId: slot.personId, role: slot.role, ...kit }
          : {
              firstName: slot.firstName,
              lastName: slot.lastName,
              email: slot.email,
              immigrationStatus: slot.immigrationStatus,
              statusExpiresAt: personStatusAllowsExpiry(slot.immigrationStatus)
                ? slot.statusExpiresAt
                : "",
              role: slot.role,
              ...kit,
            };
      }),
    [slots, customFile],
  );

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        person_missing: t("errors.personMissing"),
        principal_required: t("errors.principalRequired"),
        create_failed: t("errors.createFailed"),
        update_failed: t("errors.updateFailed"),
        not_found: t("errors.notFound"),
        forbidden: t("errors.forbidden"),
        trial_expired: t("errors.trialExpired"),
      }[state.error] ?? t("errors.generic")
    : null;

  function updateSlot(index: number, patch: Partial<ProjectFormSlot>) {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }

  function addDependent() {
    setSlots((prev) => [
      ...prev,
      emptySlot("dependent", { applicationLocation, mode: defaultPersonMode }),
    ]);
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <FormStack action={formAction} gap="loose">
      <input type="hidden" name="locale" value={locale} />
      {initial ? (
        <input type="hidden" name="projectId" value={initial.projectId} />
      ) : null}
      <input type="hidden" name="composition" value={composition} />
      <input type="hidden" name="programFamily" value={programFamily} />
      <input
        type="hidden"
        name="organizationProgramId"
        value={organizationProgramId ?? ""}
      />
      <input type="hidden" name="jurisdiction" value="federal" />
      <input type="hidden" name="formLanguage" value={formLanguage} />
      <input type="hidden" name="applicationLocation" value={applicationLocation} />
      <input type="hidden" name="isCommonLaw" value={isCommonLaw ? "Y" : "N"} />
      <input
        type="hidden"
        name="needsCustodian"
        value={needsCustodian ? "Y" : "N"}
      />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="statusAt" value={statusAt} />
      <input type="hidden" name="submitBefore" value={submitBefore} />
      <input
        type="hidden"
        name="representativeUserId"
        value={representativeUserId}
      />
      <input type="hidden" name="title" value={title} />
      <input type="hidden" name="description" value={description} />
      {!isEdit ? <input type="hidden" name="notes" value={notes} /> : null}
      <input
        type="hidden"
        name="participants"
        value={JSON.stringify(participantsPayload)}
      />

      {isEdit ? (
        <FieldGrid>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="title">{t("titleLabel")}</FieldLabel>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="status">{t("status")}</FieldLabel>
            <NativeSelect
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ProjectStatus);
                setStatusAt(todayDateInputValue());
              }}
            >
              {PROJECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`statuses.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="statusAt">{t("statusAt")}</FieldLabel>
            <Input
              id="statusAt"
              type="date"
              value={statusAt}
              onChange={(e) => setStatusAt(e.target.value)}
              required
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="submitBefore">{t("submitBefore")}</FieldLabel>
            <Input
              id="submitBefore"
              type="date"
              value={submitBefore}
              onChange={(e) => setSubmitBefore(e.target.value)}
            />
            <FieldHint>{t("submitBeforeHelp")}</FieldHint>
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="representative">{t("representative")}</FieldLabel>
            <NativeSelect
              id="representative"
              value={representativeUserId}
              onChange={(e) => setRepresentativeUserId(e.target.value)}
              required={members.length > 0}
            >
              {members.length === 0 ? (
                <option value="">{t("representativeEmpty")}</option>
              ) : (
                members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email || member.user_id}
                  </option>
                ))
              )}
            </NativeSelect>
            <FieldHint>{t("representativeHelp")}</FieldHint>
          </Field>
        </FieldGrid>
      ) : (
        <FieldGrid>
          <Field>
            <FieldLabel htmlFor="submitBefore">{t("submitBefore")}</FieldLabel>
            <Input
              id="submitBefore"
              type="date"
              value={submitBefore}
              onChange={(e) => setSubmitBefore(e.target.value)}
            />
            <FieldHint>{t("submitBeforeHelp")}</FieldHint>
          </Field>
          <Field>
            <FieldLabel htmlFor="representative">{t("representative")}</FieldLabel>
            <NativeSelect
              id="representative"
              value={representativeUserId}
              onChange={(e) => setRepresentativeUserId(e.target.value)}
              required={members.length > 0}
            >
              {members.length === 0 ? (
                <option value="">{t("representativeEmpty")}</option>
              ) : (
                members.map((member) => (
                  <option key={member.user_id} value={member.user_id}>
                    {member.full_name || member.email || member.user_id}
                  </option>
                ))
              )}
            </NativeSelect>
            <FieldHint>{t("representativeHelp")}</FieldHint>
          </Field>
        </FieldGrid>
      )}

      <Field>
        <FieldLabel htmlFor="description">{t("description")}</FieldLabel>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          maxLength={500}
          rows={2}
        />
        <FieldHint>{t("descriptionHelp")}</FieldHint>
      </Field>

      {!isEdit ? (
        <Field>
          <FieldLabel htmlFor="notes">{t("notes")}</FieldLabel>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("notesPlaceholder")}
            maxLength={10000}
            rows={4}
          />
          <FieldHint>{t("notesHelp")}</FieldHint>
        </Field>
      ) : null}

      <Field>
        <FieldLabel>{t("composition")}</FieldLabel>
        <div className="grid grid-cols-3 gap-2">
          {(["individual", "couple", "family"] as const).map((value) => {
            const allowed = selectedOrgProgram
              ? compositionAllowed(selectedOrgProgram, value)
              : true;
            return (
              <button
                key={value}
                type="button"
                disabled={!allowed}
                onClick={() => setComposition(value)}
                className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                  composition === value
                    ? "border-action bg-accent text-accent-foreground"
                    : "border-border bg-surface text-muted-foreground hover:bg-muted"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {t(`compositions.${value}`)}
              </button>
            );
          })}
        </div>
      </Field>

      <FieldGrid>
        <Field>
          <FieldLabel htmlFor="programFamily">{t("program")}</FieldLabel>
          <NativeSelect
            id="programFamily"
            value={programSelectValue}
            onChange={(e) => handleProgramSelectChange(e.target.value)}
          >
            <optgroup label={to("builtinGroup")}>
              {(SELECTABLE_PROGRAM_FAMILIES.includes(programFamily) ||
              organizationProgramId
                ? SELECTABLE_PROGRAM_FAMILIES
                : [programFamily, ...SELECTABLE_PROGRAM_FAMILIES]
              ).map((family) => (
                <option key={family} value={family}>
                  {tp(family)}
                </option>
              ))}
            </optgroup>
            {orgPrograms.length > 0 ? (
              <optgroup label={to("customGroup")}>
                {orgPrograms.map((program) => (
                  <option
                    key={program.id}
                    value={orgProgramSelectValue(program.id)}
                  >
                    {program.name}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </NativeSelect>
          {customFile ? <FieldHint>{t("customHelp")}</FieldHint> : null}
          {selectedOrgProgram ? <FieldHint>{to("templateHelp")}</FieldHint> : null}
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="formLanguage">{t("formLanguage")}</FieldLabel>
          <NativeSelect
            id="formLanguage"
            value={formLanguage}
            onChange={(e) =>
              setFormLanguage(e.target.value === "fr" ? "fr" : "en")
            }
          >
            <option value="en">{t("formLanguages.en")}</option>
            <option value="fr">{t("formLanguages.fr")}</option>
          </NativeSelect>
          <FieldHint>{t("formLanguageHelp")}</FieldHint>
        </Field>
        {isFederalPermitProgram(programFamily) ||
        customFile ||
        selectedOrgProgram ? (
          <>
            {isFederalPermitProgram(programFamily) ||
            (selectedOrgProgram &&
              selectedOrgProgram.allows_inside_canada &&
              selectedOrgProgram.allows_outside_canada) ? (
              <Field>
                <FieldLabel htmlFor="applicationLocation">
                  {t("applicationLocation")}
                </FieldLabel>
                <NativeSelect
                  id="applicationLocation"
                  value={applicationLocation}
                  onChange={(e) =>
                    setApplicationLocation(
                      e.target.value === "inside" ? "inside" : "outside",
                    )
                  }
                >
                  {(selectedOrgProgram
                    ? [
                        ...(selectedOrgProgram.allows_outside_canada
                          ? (["outside"] as const)
                          : []),
                        ...(selectedOrgProgram.allows_inside_canada
                          ? (["inside"] as const)
                          : []),
                      ]
                    : (["outside", "inside"] as const)
                  ).map((loc) => (
                    <option key={loc} value={loc}>
                      {loc === "outside"
                        ? t("locationOutside")
                        : t("locationInside")}
                    </option>
                  ))}
                </NativeSelect>
                <FieldHint>{t("applicationLocationHelp")}</FieldHint>
              </Field>
            ) : null}
            {!selectedOrgProgram ? (
              <>
                <Field>
                  <FieldLabel htmlFor="isCommonLaw">{t("isCommonLaw")}</FieldLabel>
                  <NativeSelect
                    id="isCommonLaw"
                    value={isCommonLaw ? "Y" : "N"}
                    onChange={(e) => setIsCommonLaw(e.target.value === "Y")}
                  >
                    <option value="N">{t("commonLawNo")}</option>
                    <option value="Y">{t("commonLawYes")}</option>
                  </NativeSelect>
                  <FieldHint>{t("isCommonLawHelp")}</FieldHint>
                </Field>
                {isStudyPermitProgram(programFamily) ? (
                  <Field>
                    <FieldLabel htmlFor="needsCustodian">{t("isMinor")}</FieldLabel>
                    <NativeSelect
                      id="needsCustodian"
                      value={needsCustodian ? "Y" : "N"}
                      onChange={(e) => setNeedsCustodian(e.target.value === "Y")}
                    >
                      <option value="N">{t("commonLawNo")}</option>
                      <option value="Y">{t("commonLawYes")}</option>
                    </NativeSelect>
                    <FieldHint>{t("isMinorHelp")}</FieldHint>
                  </Field>
                ) : null}
              </>
            ) : null}
          </>
        ) : null}
      </FieldGrid>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <FieldLabel>{t("participants")}</FieldLabel>
          {composition === "family" ? (
            <button
              type="button"
              onClick={addDependent}
              className="text-sm font-medium text-action hover:underline"
            >
              {t("addDependent")}
            </button>
          ) : null}
        </div>

        {slots.map((slot, index) => (
          <div
            key={`${slot.role}-${index}`}
            className="space-y-3 rounded-xl border border-border bg-canvas p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-brand">
                {tr(slot.role)}
              </p>
              <div className="flex items-center gap-2 text-xs">
                {slot.role !== "principal" && slots.length > 1 ? (
                  <>
                    <button
                      type="button"
                      className="text-destructive hover:underline"
                      onClick={() => removeSlot(index)}
                    >
                      {t("removePerson")}
                    </button>
                    {canCreatePeople ? <span className="text-border">|</span> : null}
                  </>
                ) : null}
                {canCreatePeople ? (
                  <>
                    <button
                      type="button"
                      className={
                        slot.mode === "new"
                          ? "font-semibold text-action"
                          : "text-muted-foreground"
                      }
                      onClick={() =>
                        updateSlot(index, {
                          mode: "new",
                          personId: "",
                        })
                      }
                    >
                      {t("newPerson")}
                    </button>
                    <span className="text-border">|</span>
                    <button
                      type="button"
                      className={
                        slot.mode === "existing"
                          ? "font-semibold text-action"
                          : "text-muted-foreground"
                      }
                      onClick={() => updateSlot(index, { mode: "existing" })}
                    >
                      {t("existingPerson")}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {slot.mode === "existing" ? (
              <NativeSelect
                value={slot.personId}
                onChange={(e) => {
                  const person = people.find((p) => p.id === e.target.value);
                  updateSlot(index, {
                    personId: e.target.value,
                    firstName: person?.first_name ?? "",
                    lastName: person?.last_name ?? "",
                    email: person?.email ?? "",
                  });
                }}
                required
              >
                <option value="" disabled={Boolean(slot.personId)}>
                  {t("selectPerson")}
                </option>
                {people.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.first_name} {person.last_name}
                    {person.email ? ` · ${person.email}` : ""}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <FieldGrid>
                <Field>
                  <FieldLabel required>{t("firstName")}</FieldLabel>
                  <Input
                    value={slot.firstName}
                    onChange={(e) =>
                      updateSlot(index, { firstName: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field>
                  <FieldLabel required>{t("lastName")}</FieldLabel>
                  <Input
                    value={slot.lastName}
                    onChange={(e) =>
                      updateSlot(index, { lastName: e.target.value })
                    }
                    required
                  />
                </Field>
                <Field className="sm:col-span-2">
                  <FieldLabel>{t("emailOptional")}</FieldLabel>
                  <Input
                    type="email"
                    value={slot.email}
                    onChange={(e) =>
                      updateSlot(index, { email: e.target.value })
                    }
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`immigrationStatus-${index}`}>
                    {t("immigrationStatus")}
                  </FieldLabel>
                  <NativeSelect
                    id={`immigrationStatus-${index}`}
                    value={slot.immigrationStatus}
                    onChange={(e) => {
                      const next = e.target
                        .value as PersonImmigrationStatus;
                      updateSlot(index, {
                        immigrationStatus: next,
                        statusExpiresAt: personStatusAllowsExpiry(next)
                          ? slot.statusExpiresAt
                          : "",
                      });
                    }}
                  >
                    {PERSON_IMMIGRATION_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {ti(value)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`statusExpiresAt-${index}`}>
                    {t("statusExpiresAt")}
                  </FieldLabel>
                  <Input
                    id={`statusExpiresAt-${index}`}
                    type="date"
                    value={slot.statusExpiresAt}
                    disabled={!personStatusAllowsExpiry(slot.immigrationStatus)}
                    onChange={(e) =>
                      updateSlot(index, { statusExpiresAt: e.target.value })
                    }
                  />
                </Field>
              </FieldGrid>
            )}
            {customFile ? (
              <FieldGrid>
                <Field>
                  <FieldLabel htmlFor={`personProgram-${index}`}>
                    {t("personProgram")}
                  </FieldLabel>
                  <NativeSelect
                    id={`personProgram-${index}`}
                    value={slot.programFamily}
                    onChange={(e) => {
                      const next = e.target.value;
                      updateSlot(index, {
                        programFamily: isPermitKitFamily(next)
                          ? next
                          : "work_permit",
                        needsCustodian:
                          next === "study_permit" ? slot.needsCustodian : false,
                      });
                    }}
                  >
                    {PERMIT_PROGRAM_FAMILIES.map((family) => (
                      <option key={family} value={family}>
                        {tp(family)}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`personLocation-${index}`}>
                    {t("applicationLocation")}
                  </FieldLabel>
                  <NativeSelect
                    id={`personLocation-${index}`}
                    value={slot.applicationLocation}
                    onChange={(e) =>
                      updateSlot(index, {
                        applicationLocation:
                          e.target.value === "inside" ? "inside" : "outside",
                      })
                    }
                  >
                    <option value="outside">{t("locationOutside")}</option>
                    <option value="inside">{t("locationInside")}</option>
                  </NativeSelect>
                </Field>
                {slot.programFamily === "study_permit" ? (
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor={`personMinor-${index}`}>
                      {t("isMinor")}
                    </FieldLabel>
                    <NativeSelect
                      id={`personMinor-${index}`}
                      value={slot.needsCustodian ? "Y" : "N"}
                      onChange={(e) =>
                        updateSlot(index, {
                          needsCustodian: e.target.value === "Y",
                        })
                      }
                    >
                      <option value="N">{t("commonLawNo")}</option>
                      <option value="Y">{t("commonLawYes")}</option>
                    </NativeSelect>
                    <FieldHint>{t("isMinorHelp")}</FieldHint>
                  </Field>
                ) : null}
              </FieldGrid>
            ) : null}
          </div>
        ))}
      </div>

      {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending
          ? isEdit
            ? t("saving")
            : t("creating")
          : isEdit
            ? t("save")
            : t("create")}
      </Button>
    </FormStack>
  );
}

/** @deprecated Prefer ProjectForm */
export function CreateProjectForm(props: {
  locale: string;
  people: ExistingPerson[];
  members: OrgMemberOption[];
  currentUserId?: string;
  presetPersonId?: string;
  canCreatePeople?: boolean;
  organizationPrograms?: OrganizationProgram[];
}) {
  return <ProjectForm {...props} />;
}
