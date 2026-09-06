import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isPracticeBundleEnabled,
  normalizeModuleSelection,
  togglePracticeBundle,
  validateModuleSelection,
} from "@/lib/modules/catalog";

describe("normalizeModuleSelection", () => {
  it("expands any practice module into services, bookings, and contracts", () => {
    assert.deepEqual(normalizeModuleSelection(["bookings"]), [
      "bookings",
      "services",
      "contracts",
    ]);
    assert.deepEqual(normalizeModuleSelection(["contracts", "finance"]), [
      "finance",
      "bookings",
      "services",
      "contracts",
    ]);
  });

  it("leaves standalone modules unchanged", () => {
    assert.deepEqual(normalizeModuleSelection(["finance", "immigration"]), [
      "finance",
      "immigration",
    ]);
  });
});

describe("validateModuleSelection", () => {
  it("accepts the expanded practice bundle", () => {
    assert.equal(validateModuleSelection(["services"]), null);
  });

  it("rejects payments without a charge source", () => {
    assert.equal(
      validateModuleSelection(["payments"]),
      "payments_needs_charge_source",
    );
  });

  it("accepts payments with finance or the practice bundle", () => {
    assert.equal(validateModuleSelection(["payments", "finance"]), null);
    assert.equal(validateModuleSelection(["payments", "bookings"]), null);
  });
});

describe("togglePracticeBundle", () => {
  it("turns the bundle on and off together", () => {
    const on = togglePracticeBundle(new Set(), true);
    assert.equal(isPracticeBundleEnabled(on), true);
    const off = togglePracticeBundle(on, false);
    assert.deepEqual([...off], []);
  });

  it("drops payments when the bundle is off and finance is off", () => {
    const selected = new Set(
      normalizeModuleSelection(["bookings", "payments"]),
    );
    const off = togglePracticeBundle(selected, false);
    assert.equal(off.has("payments"), false);
  });
});
