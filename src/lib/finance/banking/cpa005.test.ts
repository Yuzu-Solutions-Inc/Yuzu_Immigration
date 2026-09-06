import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildCpa005File } from "./cpa005";

describe("CPA Standard 005", () => {
  it("emits 80-byte A/C/Z records for a payroll credit", () => {
    const file = buildCpa005File({
      originatorId: "1234567890",
      fileCreationNumber: 12,
      destinationDataCentre: "00010",
      currency: "CAD",
      credits: [
        {
          amount: 1234.56,
          payeeName: "Marie Tremblay",
          institution: "815",
          transit: "12345",
          account: "0001234567",
          paymentDate: "2026-03-13",
          transactionType: "200",
          originatorShortName: "YZU",
          originatorLongName: "Yuzu Solutions Inc",
        },
      ],
    });
    const lines = file.split("\r\n").filter((line) => line.length > 0);
    assert.equal(lines.length, 3);
    assert.equal(lines[0][0], "A");
    assert.equal(lines[1][0], "C");
    assert.equal(lines[2][0], "Z");
    for (const line of lines) assert.equal(line.length, 80);
    assert.equal(lines[1].includes("200"), true);
  });
});
