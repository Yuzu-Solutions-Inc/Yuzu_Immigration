import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseFinanceQuery } from "@/lib/finance/query-calls";

describe("parseFinanceQuery", () => {
  it("accepts a select with org-safe filters", () => {
    const parsed = parseFinanceQuery("projects", [
      { prop: "select", args: ["*, partners(legal_name)"] },
      { prop: "eq", args: ["status", "active"] },
      { prop: "order", args: ["name", { ascending: true }] },
    ]);
    assert.equal(parsed.table, "projects");
    assert.equal(parsed.calls.length, 3);
  });

  it("rejects unknown tables", () => {
    assert.throws(
      () => parseFinanceQuery("people", [{ prop: "select", args: ["*"] }]),
      /invalid_table/,
    );
  });

  it("rejects non-select first calls", () => {
    assert.throws(
      () => parseFinanceQuery("projects", [{ prop: "delete", args: [] }]),
      /invalid_query/,
    );
  });

  it("rejects disallowed builder methods", () => {
    assert.throws(
      () =>
        parseFinanceQuery("projects", [
          { prop: "select", args: ["*"] },
          { prop: "or", args: ["id.eq.1"] },
        ]),
      /invalid_query/,
    );
  });
});
