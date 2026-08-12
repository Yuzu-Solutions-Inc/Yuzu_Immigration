"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createProjectAction,
  updateProjectAction,
  type ProjectActionState,
} from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  ParticipantRole,
  PersonImmigrationStatus,
  ProgramFamily,
  ProjectJurisdiction,
  ProjectStatus,
} from "@/db/schema";
import {
  SELECTABLE_PROGRAM_FAMILIES,
  defaultRolesForComposition,
  type ProjectComposition,
} from "@/lib/crm/programs";
import {
  defaultApplicationLocation,
  isFederalPermitProgram,
  isStudyPermitProgram,
  type ApplicationLocation,
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
};

export type ProjectFormInitial = {
  projectId: string;
  title: string;
  description: string;
  notes: string;
  status: ProjectStatus;
  statusAt: string;
  submitBefore: string;
  composition: ProjectComposition;
  programFamily: ProgramFamily;
  jurisdiction: ProjectJurisdiction;
  formLanguage: "en" | "fr";
  representativeUserId: string;
  applicationLocation?: ApplicationLocation;
  isCommonLaw?: boolean;
  needsCustodian?: boolean;
  slots: ProjectFormSlot[];
};

const initialState: ProjectActionState = {};

function emptySlot(role: ParticipantRole): ProjectFormSlot {
  return {
    role,
    mode: "new",
    personId: "",
    firstName: "",
    lastName: "",
    email: "",
    immigrationStatus: "none",
    statusExpiresAt: "",
  };
}

export function ProjectForm({
  locale,
  people,
  members,
  currentUserId,
  presetPersonId,
  initial,
}: {
  locale: string;
  people: ExistingPerson[];
  members: OrgMemberOption[];
  currentUserId?: string;
  presetPersonId?: string;
  initial?: ProjectFormInitial;
}) {
  const t = useTranslations("projects");
  const tp = useTranslations("programs");
  const tr = useTranslations("roles");
  const ti = useTranslations("immigrationStatus");
  const isEdit = Boolean(initial);

  const [composition, setComposition] = useState<ProjectComposition>(
    initial?.composition ?? "individual",
  );
  const [programFamily, setProgramFamily] = useState<ProgramFamily>(
    initial?.programFamily ?? "express_entry",
  );
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
  const [slots, setSlots] = useState<ProjectFormSlot[]>(
    initial?.slots?.length ? initial.slots : [emptySlot("principal")],
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
              role,
              mode: "existing" as const,
              personId: person.id,
              firstName: person.first_name,
              lastName: person.last_name,
              email: person.email ?? "",
              immigrationStatus: "none" as const,
              statusExpiresAt: "",
            };
          }
        }
        return emptySlot(role);
      }),
    );
  }, [composition, people, presetPersonId, isEdit, initial?.slots?.length]);

  useEffect(() => {
    if (skipJurisdictionSync.current) {
      skipJurisdictionSync.current = false;
      return;
    }
    if (!isEdit) {
      setApplicationLocation(defaultApplicationLocation(programFamily));
    }
  }, [programFamily, isEdit]);

  const participantsPayload = useMemo(
    () =>
      slots.map((slot) =>
        slot.mode === "existing" && slot.personId
          ? { personId: slot.personId, role: slot.role }
          : {
              firstName: slot.firstName,
              lastName: slot.lastName,
              email: slot.email,
              immigrationStatus: slot.immigrationStatus,
              statusExpiresAt: personStatusAllowsExpiry(slot.immigrationStatus)
                ? slot.statusExpiresAt
                : "",
              role: slot.role,
            },
      ),
    [slots],
  );

  const errorMessage = state.error
    ? {
        invalid: t("errors.invalid"),
        person_missing: t("errors.personMissing"),
        principal_required: t("errors.principalRequired"),
        create_failed: t("errors.createFailed"),
        update_failed: t("errors.updateFailed"),
        not_found: t("errors.notFound"),
      }[state.error] ?? t("errors.generic")
    : null;

  function updateSlot(index: number, patch: Partial<ProjectFormSlot>) {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }

  function addDependent() {
    setSlots((prev) => [...prev, emptySlot("dependent")]);
  }

  function removeSlot(index: number) {
    setSlots((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      {initial ? (
        <input type="hidden" name="projectId" value={initial.projectId} />
      ) : null}
      <input type="hidden" name="composition" value={composition} />
      <input type="hidden" name="programFamily" value={programFamily} />
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
      <input type="hidden" name="notes" value={notes} />
      <input
        type="hidden"
        name="participants"
        value={JSON.stringify(participantsPayload)}
      />

      {isEdit ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="title">{t("titleLabel")}</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="status">{t("status")}</Label>
            <select
              id="status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as ProjectStatus);
                setStatusAt(todayDateInputValue());
              }}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              {PROJECT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`statuses.${value}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="statusAt">{t("statusAt")}</Label>
            <Input
              id="statusAt"
              type="date"
              value={statusAt}
              onChange={(e) => setStatusAt(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="submitBefore">{t("submitBefore")}</Label>
            <Input
              id="submitBefore"
              type="date"
              value={submitBefore}
              onChange={(e) => setSubmitBefore(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("submitBeforeHelp")}
            </p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="representative">{t("representative")}</Label>
            <select
              id="representative"
              value={representativeUserId}
              onChange={(e) => setRepresentativeUserId(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
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
            </select>
            <p className="text-xs text-muted-foreground">
              {t("representativeHelp")}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="submitBefore">{t("submitBefore")}</Label>
            <Input
              id="submitBefore"
              type="date"
              value={submitBefore}
              onChange={(e) => setSubmitBefore(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("submitBeforeHelp")}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="representative">{t("representative")}</Label>
            <select
              id="representative"
              value={representativeUserId}
              onChange={(e) => setRepresentativeUserId(e.target.value)}
              className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
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
            </select>
            <p className="text-xs text-muted-foreground">
              {t("representativeHelp")}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="description">{t("description")}</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("descriptionPlaceholder")}
          maxLength={500}
          rows={2}
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">{t("descriptionHelp")}</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">{t("notes")}</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t("notesPlaceholder")}
          maxLength={10000}
          rows={4}
          className="rounded-xl"
        />
        <p className="text-xs text-muted-foreground">{t("notesHelp")}</p>
      </div>

      <div className="space-y-2">
        <Label>{t("composition")}</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["individual", "couple", "family"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setComposition(value)}
              className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                composition === value
                  ? "border-action bg-accent text-accent-foreground"
                  : "border-border bg-surface text-muted-foreground hover:bg-muted"
              }`}
            >
              {t(`compositions.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="programFamily">{t("program")}</Label>
          <select
            id="programFamily"
            value={programFamily}
            onChange={(e) => setProgramFamily(e.target.value as ProgramFamily)}
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            {(SELECTABLE_PROGRAM_FAMILIES.includes(programFamily)
              ? SELECTABLE_PROGRAM_FAMILIES
              : [programFamily, ...SELECTABLE_PROGRAM_FAMILIES]
            ).map((family) => (
              <option key={family} value={family}>
                {tp(family)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="formLanguage">{t("formLanguage")}</Label>
          <select
            id="formLanguage"
            value={formLanguage}
            onChange={(e) =>
              setFormLanguage(e.target.value === "fr" ? "fr" : "en")
            }
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="en">{t("formLanguages.en")}</option>
            <option value="fr">{t("formLanguages.fr")}</option>
          </select>
          <p className="text-xs text-muted-foreground">{t("formLanguageHelp")}</p>
        </div>
        {isFederalPermitProgram(programFamily) ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="applicationLocation">
                {t("applicationLocation")}
              </Label>
              {isEdit ? (
                <p
                  id="applicationLocation"
                  className="flex h-10 items-center rounded-xl border border-border bg-muted px-3 text-[15px] text-brand"
                >
                  {applicationLocation === "inside"
                    ? t("locationInside")
                    : t("locationOutside")}
                </p>
              ) : (
                <select
                  id="applicationLocation"
                  value={applicationLocation}
                  onChange={(e) =>
                    setApplicationLocation(
                      e.target.value === "inside" ? "inside" : "outside",
                    )
                  }
                  className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <option value="outside">{t("locationOutside")}</option>
                  <option value="inside">{t("locationInside")}</option>
                </select>
              )}
              <p className="text-xs text-muted-foreground">
                {isEdit
                  ? t("applicationLocationLockedHelp")
                  : t("applicationLocationHelp")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="isCommonLaw">{t("isCommonLaw")}</Label>
              <select
                id="isCommonLaw"
                value={isCommonLaw ? "Y" : "N"}
                onChange={(e) => setIsCommonLaw(e.target.value === "Y")}
                className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
              >
                <option value="N">{t("commonLawNo")}</option>
                <option value="Y">{t("commonLawYes")}</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {t("isCommonLawHelp")}
              </p>
            </div>
            {isStudyPermitProgram(programFamily) ? (
              <div className="space-y-2">
                <Label htmlFor="needsCustodian">{t("isMinor")}</Label>
                <select
                  id="needsCustodian"
                  value={needsCustodian ? "Y" : "N"}
                  onChange={(e) => setNeedsCustodian(e.target.value === "Y")}
                  className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                >
                  <option value="N">{t("commonLawNo")}</option>
                  <option value="Y">{t("commonLawYes")}</option>
                </select>
                <p className="text-xs text-muted-foreground">
                  {t("isMinorHelp")}
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Label>{t("people")}</Label>
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
                    <span className="text-border">|</span>
                  </>
                ) : null}
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
              </div>
            </div>

            {slot.mode === "existing" ? (
              <select
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
                className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px]"
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
              </select>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>{t("firstName")}</Label>
                  <Input
                    value={slot.firstName}
                    onChange={(e) =>
                      updateSlot(index, { firstName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t("lastName")}</Label>
                  <Input
                    value={slot.lastName}
                    onChange={(e) =>
                      updateSlot(index, { lastName: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>{t("emailOptional")}</Label>
                  <Input
                    type="email"
                    value={slot.email}
                    onChange={(e) =>
                      updateSlot(index, { email: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`immigrationStatus-${index}`}>
                    {t("immigrationStatus")}
                  </Label>
                  <select
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
                    className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
                  >
                    {PERSON_IMMIGRATION_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {ti(value)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`statusExpiresAt-${index}`}>
                    {t("statusExpiresAt")}
                  </Label>
                  <Input
                    id={`statusExpiresAt-${index}`}
                    type="date"
                    value={slot.statusExpiresAt}
                    disabled={!personStatusAllowsExpiry(slot.immigrationStatus)}
                    onChange={(e) =>
                      updateSlot(index, { statusExpiresAt: e.target.value })
                    }
                    className="disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
                  />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending
          ? isEdit
            ? t("saving")
            : t("creating")
          : isEdit
            ? t("save")
            : t("create")}
      </Button>
    </form>
  );
}

/** @deprecated Prefer ProjectForm */
export function CreateProjectForm(props: {
  locale: string;
  people: ExistingPerson[];
  members: OrgMemberOption[];
  currentUserId?: string;
  presetPersonId?: string;
}) {
  return <ProjectForm {...props} />;
}
