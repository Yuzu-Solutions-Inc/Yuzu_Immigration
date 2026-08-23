/**
 * Distinctive XFA dataset tags the fillers write. Weekly watch decrypts
 * datasets only (one object) and asserts these still exist — cheaper than a
 * full fill, enough to catch IRCC renaming a block.
 */
export const DATASET_TAG_CONTRACT: Record<string, readonly string[]> = {
  imm1294e: ["FamilyName", "GivenName"],
  imm1294f: ["FamilyName", "GivenName"],
  imm1295e: ["DetailsOfWork", "FamilyName"],
  imm1295f: ["DetailsOfWork", "FamilyName"],
  imm5257e: ["DetailsOfVisit", "VisaType"],
  imm5257f: ["DetailsOfVisit", "VisaType"],
  imm5257sch1e: ["FormName", "ServedInMilitary"],
  imm5257sch1f: ["FormName", "ServedInMilitary"],
  imm5708e: ["DetailsOfVisit"],
  imm5708f: ["DetailsOfVisit"],
  imm5709e: ["DetailsOfStudy"],
  imm5709f: ["DetailsOfStudy"],
  imm5710e: ["DetailsOfWork"],
  imm5710f: ["DetailsOfWork"],
  imm5645e: ["AppName"],
  imm5645f: ["AppName"],
  imm5406e: ["FamilyName"],
  imm5406f: ["FamilyName"],
  imm5646e: ["FamilyName"],
  imm5646f: ["FamilyName"],
  imm5707e: ["FamilyName"],
  imm5707f: ["FamilyName"],
  imm0008e: ["PersonalDetails", "FamilyName"],
  imm0008f: ["PersonalDetails", "FamilyName"],
  imm1344e: ["SponsorDetails", "FamilyName"],
  imm1344f: ["SponsorDetails", "FamilyName"],
  imm5562e: ["FamilyName", "IMM_5562"],
  imm5562f: ["FamilyName", "IMM_5562"],
  cit0002e: ["CIT_0002", "familyName"],
  cit0002f: ["CIT_0002", "familyName"],
};

export function missingDatasetTags(xml: string, tags: readonly string[]): string[] {
  return tags.filter((tag) => !xml.includes(`<${tag}`));
}
