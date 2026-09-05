import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { canAdministerOrg, isAdmin } from "@/lib/auth/rbac";

describe("org administration", () => {
  it("treats owner as an org administrator", () => {
    assert.equal(isAdmin("owner"), true);
    assert.equal(canAdministerOrg("owner"), true);
    assert.equal(canAdministerOrg("admin"), true);
    assert.equal(canAdministerOrg("case_manager"), false);
    assert.equal(canAdministerOrg("unlicensed"), false);
  });
});
