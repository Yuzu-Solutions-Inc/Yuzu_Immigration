import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  classifyPasswordUpdateError,
  isPasswordPolicyMet,
} from "@/lib/auth/password-policy";

describe("password policy", () => {
  it("requires length plus all four character classes", () => {
    assert.equal(isPasswordPolicyMet("Pass1!"), false);
    assert.equal(isPasswordPolicyMet("password1!"), false);
    assert.equal(isPasswordPolicyMet("PASSWORD1!"), false);
    assert.equal(isPasswordPolicyMet("Password!"), false);
    assert.equal(isPasswordPolicyMet("Password1"), false);
    assert.equal(isPasswordPolicyMet("Password1!"), true);
  });

  it("maps GoTrue update errors", () => {
    assert.equal(
      classifyPasswordUpdateError({
        message:
          "Password should contain at least one character of each: abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789, !@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~.",
      }),
      "password_weak",
    );
    assert.equal(
      classifyPasswordUpdateError({
        code: "weak_password",
        message: "Password is known to be weak and easy to guess",
      }),
      "password_weak",
    );
    assert.equal(
      classifyPasswordUpdateError({
        message: "New password should be different from the old password.",
      }),
      "password_reuse",
    );
    assert.equal(
      classifyPasswordUpdateError({ message: "Auth session missing!" }),
      "password_update_failed",
    );
  });
});
