/**
 * Fill IMM 5709 — change conditions / extend stay as a student (in Canada).
 * XFA layout matches IMM 5710 closely; study details map onto the work block
 * until a dedicated 5709 datasets dump is captured.
 */
import formMeta from "../form-meta.json";
import { fillXfaDatasetsIncremental, type FormMeta } from "../xfa-incremental";
import {
  type Imm5710Answers,
  normalize5710Answers,
  patchForm5710,
} from "./imm5710";

export type Imm5709Answers = Imm5710Answers & {
  schoolName?: string;
  schoolAddress?: string;
  schoolCity?: string;
  schoolProvince?: string;
  studyLevel?: string;
  fieldOfStudy?: string;
};

export async function fillImm5709Pdf(
  blankPdf: Uint8Array,
  answers: Imm5709Answers,
  lang: "e" | "f" = "e",
): Promise<Uint8Array> {
  const key = `imm5709${lang}`;
  const meta = (formMeta as Record<string, FormMeta>)[key];
  if (!meta) throw new Error(`Missing form meta for ${key}`);
  const mapped: Imm5710Answers = {
    ...answers,
    employerName: answers.employerName || answers.schoolName || "",
    employerAddress: answers.employerAddress || answers.schoolAddress || "",
    workCity: answers.workCity || answers.schoolCity || "",
    workProvince: answers.workProvince || answers.schoolProvince || "",
    jobTitle: answers.jobTitle || answers.studyLevel || "",
    jobDescription: answers.jobDescription || answers.fieldOfStudy || "",
    applyingNewEmployer: false,
  };
  const normalized = normalize5710Answers(mapped);
  return fillXfaDatasetsIncremental(blankPdf, meta, (xml) =>
    patchForm5710(xml, normalized),
  );
}
