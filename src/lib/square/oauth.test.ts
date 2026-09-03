import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { squareWebhookNotificationUrlCandidates } from "@/lib/square/oauth";

describe("square webhook notification URLs", () => {
  it("includes the app origin, request host, and www/apex pair", () => {
    const urls = squareWebhookNotificationUrlCandidates(
      "https://www.dossierly.ca",
      "https://dossierly.ca/api/square/webhook",
    );
    assert.deepEqual(new Set(urls), new Set([
      "https://www.dossierly.ca/api/square/webhook",
      "https://dossierly.ca/api/square/webhook",
    ]));
  });
});
