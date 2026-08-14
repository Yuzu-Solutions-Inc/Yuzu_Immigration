import type { OrgProgramDocumentSeed, OrgProgramFormSeed } from "@/lib/crm/org-programs";
import {
  expandSeedsForParticipants,
  type ExpandedKitSeedForm,
  type KitSeedForm,
} from "@/lib/ircc/kits";
import { isFormCode } from "@/lib/ircc/catalog";

export function kitSeedsFromOrgProgramForms(
  forms: OrgProgramFormSeed[],
): KitSeedForm[] {
  return forms
    .filter((form) => isFormCode(form.formCode))
    .map((form) => ({
      formCode: form.formCode,
      isRequired: form.isRequired,
      sortOrder: form.sortOrder,
    }));
}

export function expandOrgProgramFormSeeds(
  forms: OrgProgramFormSeed[],
  personIds: string[],
): ExpandedKitSeedForm[] {
  return expandSeedsForParticipants(
    kitSeedsFromOrgProgramForms(forms),
    personIds,
  );
}

export type ExpandedOrgDocumentSeed = {
  personId: string;
  docKey: "passport" | "photo" | "custom";
  customLabel: string | null;
  requestScope: "person" | "project";
  isRequired: boolean;
  sortOrder: number;
};

/**
 * Expand template documents onto participants.
 * Project-scoped docs attach to the principal for upload attribution.
 */
export function expandOrgProgramDocumentSeeds(
  documents: OrgProgramDocumentSeed[],
  personIds: string[],
): ExpandedOrgDocumentSeed[] {
  const people = personIds.filter(Boolean);
  if (people.length === 0) return [];
  const principalId = people[0]!;
  const out: ExpandedOrgDocumentSeed[] = [];

  documents.forEach((doc, index) => {
    const sortOrder = doc.sortOrder || (index + 1) * 10;
    if (doc.scope === "project") {
      out.push({
        personId: principalId,
        docKey: doc.docKey,
        customLabel: doc.docKey === "custom" ? doc.customLabel : null,
        requestScope: "project",
        isRequired: doc.isRequired,
        sortOrder,
      });
      return;
    }
    people.forEach((personId, personIndex) => {
      out.push({
        personId,
        docKey: doc.docKey,
        customLabel: doc.docKey === "custom" ? doc.customLabel : null,
        requestScope: "person",
        isRequired: doc.isRequired,
        sortOrder: sortOrder * 100 + personIndex,
      });
    });
  });

  return out;
}
