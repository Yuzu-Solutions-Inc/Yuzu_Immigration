import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { setupCheckIdsFor } from "./steps";

describe("setupCheckIdsFor", () => {
  it("always includes the account name task", () => {
    assert.deepEqual(
      setupCheckIdsFor({
        enabledModules: [],
        isAdmin: true,
        canManageServices: true,
      }),
      ["account"],
    );
  });

  it("adds immigration and booking tasks from enabled modules", () => {
    assert.deepEqual(
      setupCheckIdsFor({
        enabledModules: ["immigration", "bookings", "services", "contracts"],
        isAdmin: false,
        canManageServices: false,
      }),
      ["account", "representative", "signature", "hours", "calendar", "meeting"],
    );
  });

  it("adds the service catalog task for managers when services is on", () => {
    assert.ok(
      setupCheckIdsFor({
        enabledModules: ["services", "bookings", "contracts"],
        isAdmin: true,
        canManageServices: true,
      }).includes("service"),
    );
  });

  it("adds signature when contracts is on", () => {
    assert.ok(
      setupCheckIdsFor({
        enabledModules: ["contracts", "services", "bookings"],
        isAdmin: false,
        canManageServices: false,
      }).includes("signature"),
    );
  });
});
