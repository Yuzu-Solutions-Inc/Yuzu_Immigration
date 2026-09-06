import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeInvoiceTotals, invoiceTaxDisplayRows, salesTaxLinesForInvoice } from "./invoice";

const qcSettings = {
  charge_gst: true,
  charge_qst: true,
  gst_rate: 0.05,
  qst_rate: 0.09975,
};

describe("invoice place-of-supply totals", () => {
  it("charges GST and QST for a Quebec partner", () => {
    const t = computeInvoiceTotals(1000, qcSettings, "QC");
    assert.equal(t.gst, 50);
    assert.equal(t.qst, 99.75);
    assert.equal(t.total, 1149.75);
    assert.equal(t.placeOfSupply?.regime, "gst_qst");
  });

  it("stores HST in the gst column for Ontario", () => {
    const t = computeInvoiceTotals(1000, qcSettings, "ON");
    assert.equal(t.gst, 130);
    assert.equal(t.qst, 0);
    assert.equal(t.total, 1130);
    assert.equal(t.placeOfSupply?.regime, "hst");
  });

  it("does not put PST into the qst column for British Columbia", () => {
    const t = computeInvoiceTotals(1000, qcSettings, "BC");
    assert.equal(t.gst, 50);
    assert.equal(t.qst, 0);
    assert.equal(t.total, 1050);
  });

  it("labels HST when the partner is in an HST province", () => {
    const rows = invoiceTaxDisplayRows({ gst: 130, qst: 0 }, "ON", {
      gst: "GST",
      qst: "QST",
      hst: "HST",
    });
    assert.deepEqual(rows, [{ label: "HST", amount: 130 }]);
  });

  it("omits PST from persisted sales-tax lines", () => {
    const t = computeInvoiceTotals(1000, qcSettings, "BC");
    const lines = salesTaxLinesForInvoice("inv-1", t);
    assert.equal(lines.some((l) => l.tax_code === "PST"), false);
    assert.equal(lines.some((l) => l.tax_code === "GST"), true);
  });
});
