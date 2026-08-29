import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { customSchemaFillCounts } from "@/lib/custom-forms/completeness";
import type { CustomFormSchema } from "@/lib/custom-forms/schema";

const schema: CustomFormSchema = {
  version: 1,
  sections: [
    {
      id: "employment",
      key: "employment",
      title: { en: "Employment" },
      fields: [
        {
          id: "hasWorked",
          key: "worked",
          type: "yesno",
          label: { en: "Worked?" },
          required: true,
        },
        {
          id: "employer",
          key: "employer",
          type: "text",
          label: { en: "Employer" },
          required: true,
          showWhen: { key: "worked", equals: "Y" },
        },
      ],
    },
  ],
};

describe("customSchemaFillCounts", () => {
  it("ignores hidden required fields when the gate is off", () => {
    const closed = customSchemaFillCounts(schema, { worked: "N" });
    assert.equal(closed.total, 1);
    assert.equal(closed.filled, 1);
    assert.equal(closed.percent, 100);
  });

  it("counts revealed required fields once the gate is on", () => {
    const openEmpty = customSchemaFillCounts(schema, { worked: "Y" });
    assert.equal(openEmpty.total, 2);
    assert.equal(openEmpty.filled, 1);
    assert.equal(openEmpty.percent, 50);

    const openFilled = customSchemaFillCounts(schema, {
      worked: "Y",
      employer: "Acme",
    });
    assert.equal(openFilled.filled, 2);
    assert.equal(openFilled.percent, 100);
  });
});
