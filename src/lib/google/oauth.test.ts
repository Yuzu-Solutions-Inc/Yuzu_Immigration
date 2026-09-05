import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

import {
  googleAuthUrl,
  googleOAuthRedirectUri,
  googleScopesForIntent,
} from "@/lib/google/oauth";

const EXTRA_UNVERIFIED_SCOPES = [
  "https://www.googleapis.com/auth/calendar.freebusy",
  "https://www.googleapis.com/auth/meetings.space.created",
];

describe("Google OAuth scopes", () => {
  it("requests only calendar.events plus Sign-In scopes for calendar and Meet", () => {
    for (const intent of ["calendar", "meetings"] as const) {
      const scopes = googleScopesForIntent(intent).split(" ");
      assert.deepEqual(scopes, [
        "https://www.googleapis.com/auth/calendar.events",
        "openid",
        "email",
      ]);
      for (const extra of EXTRA_UNVERIFIED_SCOPES) {
        assert.equal(scopes.includes(extra), false);
      }
    }
  });

  describe("authorize URL", () => {
    const previousId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
    const previousSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;

    before(() => {
      process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-google-client-id";
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-google-client-secret";
    });

    after(() => {
      if (previousId === undefined) delete process.env.GOOGLE_CALENDAR_CLIENT_ID;
      else process.env.GOOGLE_CALENDAR_CLIENT_ID = previousId;
      if (previousSecret === undefined) {
        delete process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
      } else {
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET = previousSecret;
      }
    });

    it("puts the approved scopes on the Google authorize request", () => {
      const url = new URL(
        googleAuthUrl({
          origin: "https://www.dossierly.ca",
          state: "opaque-state",
          intent: "calendar",
        }),
      );
      assert.equal(
        url.origin + url.pathname,
        "https://accounts.google.com/o/oauth2/v2/auth",
      );
      assert.equal(
        url.searchParams.get("redirect_uri"),
        googleOAuthRedirectUri("https://www.dossierly.ca"),
      );
      assert.equal(
        url.searchParams.get("scope"),
        googleScopesForIntent("calendar"),
      );
      for (const extra of EXTRA_UNVERIFIED_SCOPES) {
        assert.equal(url.searchParams.get("scope")?.includes(extra), false);
      }
    });
  });
});
