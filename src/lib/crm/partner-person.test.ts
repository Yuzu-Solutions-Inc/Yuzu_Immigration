import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  asImmigrationStatus,
  partnerLegalName,
  splitDisplayName,
} from "@/lib/crm/partner-person-names";

describe("partner-person name mapping", () => {
  it("splits a full legal name into first and last", () => {
    assert.deepEqual(splitDisplayName("Marie Curie"), {
      firstName: "Marie",
      lastName: "Curie",
    });
  });

  it("prefers contact name when present", () => {
    assert.deepEqual(splitDisplayName("Acme Inc", "Ada Lovelace"), {
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });

  it("uses a single token as both names", () => {
    assert.deepEqual(splitDisplayName("Cher"), {
      firstName: "Cher",
      lastName: "Cher",
    });
  });

  it("joins first and last into a directory name", () => {
    assert.equal(partnerLegalName("Ada", "Lovelace"), "Ada Lovelace");
  });

  it("falls back unknown immigration statuses to none", () => {
    assert.equal(asImmigrationStatus("worker"), "worker");
    assert.equal(asImmigrationStatus("not-a-status"), "none");
    assert.equal(asImmigrationStatus(null), "none");
  });
});
