import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CANONICAL_FIELDS, REPEATABLE_TABLES } from "./fields";
import {
  answersForForm,
  fillCasesForForm,
  isQuestionnaireAnswerKey,
} from "./fill-fixtures";

describe("fill fixtures", () => {
  it("only uses questionnaire keys", () => {
    const answers = answersForForm("imm1295", "full");
    for (const key of Object.keys(answers)) {
      assert.equal(isQuestionnaireAnswerKey(key), true, key);
    }
  });

  it("required case omits gated optionals", () => {
    const answers = answersForForm("imm1294", "required");
    assert.equal(answers.hasAlias, "N");
    assert.equal(answers.aliasFamilyName, undefined);
    assert.ok(answers.familyName);
    assert.equal(answers.maritalStatus, "02");
  });

  it("full case opens optional blocks the form can ask", () => {
    const answers = answersForForm("imm1295", "full");
    assert.equal(answers.hasAlias, "Y");
    assert.equal(answers.aliasFamilyName, "Alami");
    assert.equal(answers.lmiaNumber, "8000000");
    assert.equal(answers.workPermitType, "LMOS");
    assert.equal(answers.sameAsCor, "N");
    assert.equal(answers.cwaTo, "2027-12-31");
    assert.ok(Array.isArray(answers.jobs) && (answers.jobs as unknown[]).length >= 1);
  });

  it("covers every canonical field or table key used in samples", () => {
    const known = new Set([
      ...CANONICAL_FIELDS.map((field) => field.key),
      ...REPEATABLE_TABLES.map((table) => table.key),
    ]);
    const answers = answersForForm("imm1294", "full");
    for (const key of Object.keys(answers)) {
      if (key === "formLanguage" || key === "email") continue;
      assert.ok(known.has(key), key);
    }
  });

  it("uses two or three cases per primary form", () => {
    assert.deepEqual(fillCasesForForm("imm1295"), ["required", "typical", "full"]);
    assert.deepEqual(fillCasesForForm("imm5483"), ["required", "full"]);
  });
});
