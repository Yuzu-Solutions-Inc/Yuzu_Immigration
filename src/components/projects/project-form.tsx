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
import type {
  ParticipantRole,
  PersonImmigrationStatus,
  ProgramFamily,
  ProjectJurisdiction,
  ProjectStatus,
} from "@/db/schema";
import {
  PROGRAM_FAMILIES,
  defaultJurisdictionForProgram,
  defaultRolesForComposition,
  type ProjectComposition,
} from "@/lib/crm/programs";
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
  status: ProjectStatus;
  statusAt: string;
  submitBefore: string;
  composition: ProjectComposition;
  programFamily: ProgramFamily;
  jurisdiction: ProjectJurisdiction;
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
  presetPersonId,
  initial,
}: {
  locale: "en" | "fr";
  people: ExistingPerson[];
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
  const [jurisdiction, setJurisdiction] = useState<ProjectJurisdiction>(
    initial?.jurisdiction ?? defaultJurisdictionForProgram("express_entry"),
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
  const [title, setTitle] = useState(initial?.title ?? "");
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
    setJurisdiction(defaultJurisdictionForProgram(programFamily));
  }, [programFamily]);

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
      <input type="hidden" name="jurisdiction" value={jurisdiction} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="statusAt" value={statusAt} />
      <input type="hidden" name="submitBefore" value={submitBefore} />
      <input type="hidden" name="title" value={title} />
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
          <div className="space-y-2 sm:col-span-2">
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
        </div>
      ) : (
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
      )}

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
            {PROGRAM_FAMILIES.map((family) => (
              <option key={family} value={family}>
                {tp(family)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="jurisdiction">{t("jurisdiction")}</Label>
          <select
            id="jurisdiction"
            value={jurisdiction}
            onChange={(e) =>
              setJurisdiction(e.target.value as ProjectJurisdiction)
            }
            className="h-10 w-full rounded-xl border border-input bg-surface px-3 text-[15px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
          >
            <option value="federal">{t("jurisdictions.federal")}</option>
            <option value="quebec">{t("jurisdictions.quebec")}</option>
            <option value="both">{t("jurisdictions.both")}</option>
          </select>
        </div>
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
                <option value="">{t("selectPerson")}</option>
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
  locale: "en" | "fr";
  people: ExistingPerson[];
  presetPersonId?: string;
}) {
  return <ProjectForm {...props} />;
}
