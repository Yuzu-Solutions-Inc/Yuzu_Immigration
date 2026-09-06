import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { tourStepsFor, unseenModules } from "./tour";

describe("tourStepsFor", () => {
  it("includes core nav for every member", () => {
    const ids = tourStepsFor({
      enabledModules: [],
      isAdmin: false,
      canCreate: true,
    }).map((s) => s.id);
    assert.deepEqual(ids, ["home", "partners", "partnersNew", "settings"]);
  });

  it("adds immigration and finance steps from enabled modules", () => {
    const ids = tourStepsFor({
      enabledModules: ["immigration", "finance"],
      isAdmin: true,
      canCreate: true,
    }).map((s) => s.id);
    assert.ok(ids.includes("projects"));
    assert.ok(ids.includes("engagements"));
    assert.ok(!ids.includes("calendar"));
  });

  it("hides create CTAs when the member cannot create", () => {
    const ids = tourStepsFor({
      enabledModules: ["immigration"],
      isAdmin: false,
      canCreate: false,
    }).map((s) => s.id);
    assert.ok(!ids.includes("partnersNew"));
    assert.ok(!ids.includes("projectsNew"));
  });

  it("limits a later-module tour to that module", () => {
    const ids = tourStepsFor({
      enabledModules: ["immigration", "finance"],
      isAdmin: true,
      canCreate: true,
      focusModules: ["finance"],
      includeCore: false,
    }).map((s) => s.id);
    assert.deepEqual(ids, ["engagements", "bank"]);
  });

  it("keeps payments as an admin-only step", () => {
    const member = tourStepsFor({
      enabledModules: ["payments", "finance"],
      isAdmin: false,
      canCreate: true,
    }).map((s) => s.id);
    const admin = tourStepsFor({
      enabledModules: ["payments", "finance"],
      isAdmin: true,
      canCreate: true,
    }).map((s) => s.id);
    assert.ok(!member.includes("payments"));
    assert.ok(admin.includes("payments"));
  });
});

describe("unseenModules", () => {
  it("returns modules not yet toured", () => {
    assert.deepEqual(
      unseenModules(["finance", "immigration"], ["immigration"]),
      ["finance"],
    );
  });
});
