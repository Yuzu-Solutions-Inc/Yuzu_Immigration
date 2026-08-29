import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { insertModuleIntoSchema } from "@/lib/custom-forms/modules";
import { emptyCustomFormSchema } from "@/lib/custom-forms/schema";

describe("insertModuleIntoSchema", () => {
  it("keeps stable keys on the first insert", () => {
    const schema = insertModuleIntoSchema(emptyCustomFormSchema(), "identity");
    const keys = schema.sections.flatMap((section) => [
      section.key,
      ...section.fields.map((field) => field.key),
    ]);
    assert.equal(schema.sections[0]?.key, "identity");
    assert.ok(keys.includes("identity_familyName"));
    assert.equal(new Set(keys).size, keys.length);
  });

  it("suffixes colliding keys and remaps showWhen", () => {
    const once = insertModuleIntoSchema(emptyCustomFormSchema(), "identity");
    const twice = insertModuleIntoSchema(once, "identity");
    const keys = twice.sections.flatMap((section) => [
      section.key,
      ...section.fields.map((field) => field.key),
    ]);
    assert.equal(new Set(keys).size, keys.length);
    assert.equal(twice.sections[1]?.key, "identity_2");
    const alias = twice.sections[1]?.fields.find(
      (field) => field.key === "identity_aliasFamilyName_2",
    );
    assert.deepEqual(alias?.showWhen, {
      key: "identity_hasAlias_2",
      equals: "Y",
    });
  });
});
