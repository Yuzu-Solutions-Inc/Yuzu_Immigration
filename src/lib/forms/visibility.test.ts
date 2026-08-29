import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { matchesShowWhen } from "@/lib/forms/visibility";

describe("matchesShowWhen", () => {
  it("treats a missing rule as visible", () => {
    assert.equal(matchesShowWhen(undefined, {}), true);
  });

  it("matches equals, oneOf, and notEquals", () => {
    assert.equal(
      matchesShowWhen({ key: "worked", equals: "Y" }, { worked: "Y" }),
      true,
    );
    assert.equal(
      matchesShowWhen({ key: "worked", equals: "Y" }, { worked: "N" }),
      false,
    );
    assert.equal(
      matchesShowWhen({ key: "status", oneOf: ["married", "common_law"] }, {
        status: "common_law",
      }),
      true,
    );
    assert.equal(
      matchesShowWhen({ key: "sameAddress", notEquals: "Y" }, { sameAddress: "N" }),
      true,
    );
  });

  it("ANDs an array of clauses and ORs an or-group", () => {
    assert.equal(
      matchesShowWhen(
        [
          { key: "inCanada", equals: "Y" },
          { key: "status", oneOf: ["worker", "student"] },
        ],
        { inCanada: "Y", status: "worker" },
      ),
      true,
    );
    assert.equal(
      matchesShowWhen(
        [
          { key: "inCanada", equals: "Y" },
          { key: "status", oneOf: ["worker", "student"] },
        ],
        { inCanada: "Y", status: "visitor" },
      ),
      false,
    );
    assert.equal(
      matchesShowWhen(
        { or: [{ key: "a", equals: "Y" }, { key: "b", equals: "Y" }] },
        { a: "N", b: "Y" },
      ),
      true,
    );
  });
});
