import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isAuthTokenHash } from "@/lib/auth/token-hash";

describe("isAuthTokenHash", () => {
  it("accepts hex and base64url hashes", () => {
    assert.equal(isAuthTokenHash("a".repeat(64)), true);
    assert.equal(isAuthTokenHash("AbCdef0123_-wxyz"), true);
  });

  it("rejects empty, short, or HTML-bearing values", () => {
    assert.equal(isAuthTokenHash(""), false);
    assert.equal(isAuthTokenHash("short"), false);
    assert.equal(isAuthTokenHash(`<script>alert(1)</script>${"a".repeat(16)}`), false);
    assert.equal(isAuthTokenHash(`${"a".repeat(16)}" onfocus="alert(1)`), false);
  });
});
