/**
 * Fill each IRCC blank from questionnaire fixtures (required → typical → full),
 * assert Acrobat constraints + DocMDP, and flag cells the app does not fill.
 *
 *   npx tsx scripts/verify-ircc-fill.ts
 */
process.env.IRCC_BLANKS_LOCAL = "1";

import {
  printFillCertification,
  runFillCertification,
} from "../src/lib/ircc/fill-certify";

async function main() {
  const result = await runFillCertification();
  printFillCertification(result);
  if (!result.passed) {
    console.error(`\n${result.errors.length} fill/certify assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll IRCC fill and certification checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
