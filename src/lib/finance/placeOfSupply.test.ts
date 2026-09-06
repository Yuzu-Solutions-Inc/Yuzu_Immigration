import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computePlaceOfSupply, recoverableQst } from "./placeOfSupply";

describe("Canadian place-of-supply", () => {
  it("applies GST and QST independently in Quebec (not stacked)", () => {
    const r = computePlaceOfSupply(1000, "QC");
    assert.equal(r.regime, "gst_qst");
    assert.equal(r.gst, 50);
    assert.equal(r.qst, 99.75);
    assert.equal(r.total, 1149.75);
    assert.equal(r.lines.length, 2);
  });

  it("uses a single HST line for Ontario", () => {
    const r = computePlaceOfSupply(1000, "ON");
    assert.equal(r.regime, "hst");
    assert.equal(r.hst, 130);
    assert.equal(r.gst, 0);
    assert.equal(r.qst, 0);
    assert.equal(r.total, 1130);
  });

  it("splits GST + PST in British Columbia", () => {
    const r = computePlaceOfSupply(1000, "BC");
    assert.equal(r.regime, "gst_pst");
    assert.equal(r.gst, 50);
    assert.equal(r.pst, 70);
    assert.equal(r.total, 1120);
  });

  it("uses GST only in Alberta", () => {
    const r = computePlaceOfSupply(1000, "AB");
    assert.equal(r.regime, "gst");
    assert.equal(r.gst, 50);
    assert.equal(r.total, 1050);
  });

  it("restricts QST ITR on telecom for large businesses", () => {
    assert.equal(recoverableQst(100, "telecommunications", true), 50);
    assert.equal(recoverableQst(100, "unrestricted", true), 100);
    assert.equal(recoverableQst(100, "telecommunications", false), 100);
  });
});
