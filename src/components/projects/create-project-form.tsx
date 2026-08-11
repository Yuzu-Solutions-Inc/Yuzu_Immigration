"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import {
  createProjectAction,
  type CreateProjectState,
} from "@/app/actions/projects";
import {
  PROGRAM_FAMILIES,
  defaultJurisdictionForProgram,
  defaultRolesForComposition,
  type ProjectComposition,
} from "@/lib/crm/programs";
import type { ParticipantRole, ProgramFamily } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ExistingPerson = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
};

type Slot = {
  role: ParticipantRole;
  mode: "new" | "existing";
  personId: string;
  firstName: string;
  lastName: string;
  email: string;
};

const initialState: CreateProjectState = {};

function emptySlot(role: ParticipantRole): Slot {
  return {
    role,
    mode: "new",
    personId: "",
    firstName: "",
    lastName: "",
    email: "",
  };
}

export function CreateProjectForm({
  locale,
  people,
  presetPersonId,
}: {
  locale: "en" | "fr";
  people: ExistingPerson[];
  presetPersonId?: string;
}) {
  const t = useTranslations("projects");
  const tp = useTranslations("programs");
  const tr = useTranslations("roles");

  const [composition, setComposition] =
    useState<ProjectComposition>("individual");
  const [programFamily, setProgramFamily] =
    useState<ProgramFamily>("express_entry");
  const [jurisdiction, setJurisdiction] = useState(
    defaultJurisdictionForProgram("express_entry"),
  );
  const [slots, setSlots] = useState<Slot[]>([emptySlot("principal")]);
  const [state, formAction, pending] = useActionState(
    createProjectAction,
    initialState,
  );

  useEffect(() => {
    const roles = defaultRolesForComposition(composition);
    setSlots((prev) =>
      roles.map((role, index) => {
        const existing = prev[index];
        if (existing && existing.role === role) return existing;
        if (index === 0 && presetPersonId) {
          const person = people.find((p) => p.id === presetPersonId);
          if (person) {
            return {
              role,
              mode: "existing",
              personId: person.id,
              firstName: person.first_name,
              lastName: person.last_name,
              email: person.email ?? "",
            };
          }
        }
        return emptySlot(role);
      }),
    );
  }, [composition, people, presetPersonId]);

  useEffect(() => {
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
      }[state.error] ?? t("errors.generic")
    : null;

  function updateSlot(index: number, patch: Partial<Slot>) {
    setSlots((prev) =>
      prev.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    );
  }

  function addDependent() {
    setSlots((prev) => [...prev, emptySlot("dependent")]);
  }

  return (
    <form action={formAction} className="space-y-6">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="composition" value={composition} />
      <input type="hidden" name="programFamily" value={programFamily} />
      <input type="hidden" name="jurisdiction" value={jurisdiction} />
      <input
        type="hidden"
        name="participants"
        value={JSON.stringify(participantsPayload)}
      />

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
            onChange={(e) =>
              setProgramFamily(e.target.value as ProgramFamily)
            }
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
              setJurisdiction(
                e.target.value as "federal" | "quebec" | "both",
              )
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
              <div className="flex gap-2 text-xs">
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
        {pending ? t("creating") : t("create")}
      </Button>
    </form>
  );
}
