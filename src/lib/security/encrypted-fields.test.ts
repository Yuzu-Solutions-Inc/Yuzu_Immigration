import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { encryptField, isEncryptedField } from "@/lib/security/field-crypto";
import {
  decryptOrgPayload,
  encryptOrgRow,
  encryptOrgValues,
  sortDecryptedRows,
} from "@/lib/security/encrypted-fields";

const KEY = Buffer.alloc(32, 7);

describe("encrypted-fields", () => {
  it("seals partner identity and leaves kind/province plaintext", () => {
    const sealed = encryptOrgRow(
      "partners",
      {
        legal_name: "Ada Lovelace",
        email: "ada@example.com",
        kind: "customer",
        province: "QC",
      },
      KEY,
    );
    assert.equal(isEncryptedField(sealed.legal_name), true);
    assert.equal(isEncryptedField(sealed.email), true);
    assert.equal(sealed.kind, "customer");
    assert.equal(sealed.province, "QC");
    const opened = decryptOrgPayload("partners", sealed, KEY);
    assert.equal(opened.legal_name, "Ada Lovelace");
    assert.equal(opened.email, "ada@example.com");
  });

  it("does not double-encrypt already sealed values", () => {
    const first = encryptField("secret", "organization_settings.gst_number", KEY);
    const sealed = encryptOrgRow(
      "organization_settings",
      { gst_number: first, gst_rate: 0.05 },
      KEY,
    );
    assert.equal(sealed.gst_number, first);
    assert.equal(sealed.gst_rate, 0.05);
  });

  it("decrypts nested partner embeds on invoices", () => {
    const partner = encryptOrgRow(
      "partners",
      { legal_name: "Curie Labs" },
      KEY,
    );
    const opened = decryptOrgPayload(
      "invoices",
      { notes: "pay net 30", partners: partner },
      KEY,
    );
    assert.equal(opened.partners.legal_name, "Curie Labs");
    assert.equal(opened.notes, "pay net 30");
  });

  it("encrypts arrays of rows", () => {
    const sealed = encryptOrgValues(
      "employees",
      [
        { first_name: "Ada", last_name: "Lovelace", yearly_salary: 90000 },
        { first_name: "Alan", last_name: "Turing", yearly_salary: 88000 },
      ],
      KEY,
    );
    assert.equal(isEncryptedField(sealed[0].first_name), true);
    assert.equal(sealed[0].yearly_salary, 90000);
    const opened = decryptOrgPayload("employees", sealed, KEY);
    const sorted = sortDecryptedRows("employees", opened);
    assert.equal(sorted[0].last_name, "Lovelace");
    assert.equal(sorted[1].last_name, "Turing");
  });
});
