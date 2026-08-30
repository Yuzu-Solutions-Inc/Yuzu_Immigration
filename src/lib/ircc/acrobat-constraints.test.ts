import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  acrobatLmoValue,
  completeIsoDate,
  ensureAfterToday,
  localIsoToday,
  localIsoTomorrow,
} from "./acrobat-constraints";

describe("acrobatLmoValue", () => {
  it("leaves empty as null-equivalent", () => {
    assert.equal(acrobatLmoValue("LMOS", ""), "");
    assert.equal(acrobatLmoValue("LMOS", "   "), "");
  });

  it("accepts LMIA numbers in the Acrobat range", () => {
    assert.equal(acrobatLmoValue("LMOS", "8000000"), "8000000");
    assert.equal(acrobatLmoValue("LMOS", "A-8000000"), "8000000");
    assert.equal(acrobatLmoValue("OWP", "99999999"), "99999999");
  });

  it("rejects LMIA numbers outside the range", () => {
    assert.equal(acrobatLmoValue("LMOS", "1234567"), "");
    assert.equal(acrobatLmoValue("LMOS", "5999999"), "");
    assert.equal(acrobatLmoValue("LMOS", "abc"), "");
  });

  it("keeps ELMO offer numbers as A + 7 digits", () => {
    assert.equal(acrobatLmoValue("ELMO", "A1234567"), "A1234567");
    assert.equal(acrobatLmoValue("ELMO", "a-1234567"), "A1234567");
    assert.equal(acrobatLmoValue("ELMO", "8000000"), "");
    assert.equal(acrobatLmoValue("ELMO", "AB123456"), "");
  });
});

describe("completeIsoDate / ensureAfterToday", () => {
  it("requires year, month, and day", () => {
    assert.equal(completeIsoDate("2026", "09", "01"), "2026-09-01");
    assert.equal(completeIsoDate("2026", "9", "1"), "2026-09-01");
    assert.equal(completeIsoDate("2026", "09", ""), "");
    assert.equal(completeIsoDate("2026", "", ""), "");
  });

  it("bumps today or earlier to tomorrow", () => {
    const now = new Date(2026, 7, 30);
    assert.equal(ensureAfterToday("2027-01-01", now), "2027-01-01");
    assert.equal(ensureAfterToday("2026-08-30", now), "2026-08-31");
    assert.equal(ensureAfterToday("2020-01-01", now), "2026-08-31");
    assert.equal(ensureAfterToday("", now), "");
    assert.equal(localIsoToday(now), "2026-08-30");
    assert.equal(localIsoTomorrow(now), "2026-08-31");
  });
});
