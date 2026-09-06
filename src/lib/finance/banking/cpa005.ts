/**
 * CPA Standard 005 electronic funds transfer (80-byte A / C / Z records).
 * Canadian banks commonly call this CPA-005; transaction type 200 is payroll
 * credit, 430 is accounts-payable. This is a file generator only — it does not
 * transmit to a bank.
 */

export type Cpa005Credit = {
  amount: number;
  payeeName: string;
  institution: string;
  transit: string;
  account: string;
  paymentDate: string;
  transactionType: "200" | "430" | "450";
  originatorShortName: string;
  originatorLongName: string;
  sundry?: string;
};

export type Cpa005FileInput = {
  originatorId: string;
  fileCreationNumber: number;
  destinationDataCentre: string;
  currency: "CAD";
  credits: Cpa005Credit[];
};

function field(value: string, length: number, numeric = false) {
  const cleaned = numeric ? value.replace(/\D/g, "") : value.replace(/[^\x20-\x7E]/g, " ").toUpperCase();
  if (numeric) return cleaned.slice(-length).padStart(length, "0");
  return cleaned.slice(0, length).padEnd(length, " ");
}

function cents(amount: number) {
  return Math.round(Math.abs(amount) * 100);
}

function julianDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = Date.UTC(y, m - 1, d);
  const start = Date.UTC(y, 0, 0);
  const doy = Math.floor((date - start) / 86400000);
  return `${String(y).slice(-1)}${String(doy).padStart(3, "0")}`;
}

function record80(parts: string[]) {
  const line = parts.join("").slice(0, 80).padEnd(80, " ");
  return line;
}

export function buildCpa005File(input: Cpa005FileInput): string {
  if (input.credits.length === 0) throw new Error("CPA 005 file requires at least one credit");
  const creation = julianDate(input.credits[0].paymentDate);
  const header = record80([
    "A",
    "1",
    field(input.originatorId, 10, true),
    field(String(input.fileCreationNumber), 4, true),
    creation,
    field(input.destinationDataCentre, 5, true),
    field("CPA005", 20),
    field(input.currency, 3),
    field("", 32),
  ]);

  const details = input.credits.map((credit, index) => {
    const payDate = julianDate(credit.paymentDate);
    return record80([
      "C",
      field(String(index + 1), 9, true),
      field(String(cents(credit.amount)), 10, true),
      field(credit.institution, 3, true),
      field(credit.transit, 5, true),
      field(credit.account, 12),
      field(credit.payeeName, 30),
      credit.transactionType,
      payDate,
      field(credit.originatorShortName, 3),
    ]);
  });

  const totalCents = input.credits.reduce((s, c) => s + cents(c.amount), 0);
  const trailer = record80([
    "Z",
    field(String(input.credits.length), 9, true),
    field(String(totalCents), 14, true),
    field("0", 9, true),
    field("0", 14, true),
    field("", 33),
  ]);

  return [header, ...details, trailer].join("\r\n") + "\r\n";
}
