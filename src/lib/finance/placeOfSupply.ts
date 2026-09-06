import { round2 } from "./taxes";
import { normalizeCaRegion, type CaProvinceCode } from "../sage/tax-regions";

export type SalesTaxRegime = "gst" | "hst" | "gst_pst" | "gst_qst";

export type PlaceOfSupplyLine = {
  code: "GST" | "HST" | "PST" | "QST";
  rate: number;
  amount: number;
  collectedAccount: string;
  recoverableAccount: string;
  recoverableKind: "itc" | "itr" | "none";
};

export type PlaceOfSupplyResult = {
  province: CaProvinceCode | null;
  regime: SalesTaxRegime;
  subtotal: number;
  gst: number;
  hst: number;
  pst: number;
  qst: number;
  total: number;
  lines: PlaceOfSupplyLine[];
};

const GST = 0.05;
const HST: Partial<Record<string, number>> = {
  ON: 0.13,
  NB: 0.15,
  NL: 0.15,
  NS: 0.15,
  PE: 0.15,
};
const PST: Partial<Record<string, number>> = {
  BC: 0.07,
  SK: 0.06,
  MB: 0.07,
};
const QST = 0.09975;

/**
 * Canadian place-of-supply for taxable services / IPP (customer address).
 * GST and QST/PST apply independently on the tax-exclusive consideration
 * (Québec CITCA rule since 1 Jan 2013 — do not stack QST on GST).
 */
export function computePlaceOfSupply(subtotal: number, provinceRaw: string | null | undefined): PlaceOfSupplyResult {
  const base = round2(subtotal);
  const province = normalizeCaRegion(provinceRaw);
  if (!province) {
    return emptyResult(base, null);
  }
  if (province in HST) {
    const rate = HST[province]!;
    const hst = round2(base * rate);
    return {
      province,
      regime: "hst",
      subtotal: base,
      gst: 0,
      hst,
      pst: 0,
      qst: 0,
      total: round2(base + hst),
      lines: [
        {
          code: "HST",
          rate,
          amount: hst,
          collectedAccount: "2130",
          recoverableAccount: "1230",
          recoverableKind: "itc",
        },
      ],
    };
  }
  if (province === "QC") {
    const gst = round2(base * GST);
    const qst = round2(base * QST);
    return {
      province,
      regime: "gst_qst",
      subtotal: base,
      gst,
      hst: 0,
      pst: 0,
      qst,
      total: round2(base + gst + qst),
      lines: [
        {
          code: "GST",
          rate: GST,
          amount: gst,
          collectedAccount: "2100",
          recoverableAccount: "1200",
          recoverableKind: "itc",
        },
        {
          code: "QST",
          rate: QST,
          amount: qst,
          collectedAccount: "2110",
          recoverableAccount: "1210",
          recoverableKind: "itr",
        },
      ],
    };
  }
  if (province in PST) {
    const gst = round2(base * GST);
    const pst = round2(base * PST[province]!);
    return {
      province,
      regime: "gst_pst",
      subtotal: base,
      gst,
      hst: 0,
      pst,
      qst: 0,
      total: round2(base + gst + pst),
      lines: [
        {
          code: "GST",
          rate: GST,
          amount: gst,
          collectedAccount: "2100",
          recoverableAccount: "1200",
          recoverableKind: "itc",
        },
        {
          code: "PST",
          rate: PST[province]!,
          amount: pst,
          collectedAccount: "2140",
          recoverableAccount: "1240",
          recoverableKind: "none",
        },
      ],
    };
  }
  const gst = round2(base * GST);
  return {
    province,
    regime: "gst",
    subtotal: base,
    gst,
    hst: 0,
    pst: 0,
    qst: 0,
    total: round2(base + gst),
    lines: [
      {
        code: "GST",
        rate: GST,
        amount: gst,
        collectedAccount: "2100",
        recoverableAccount: "1200",
        recoverableKind: "itc",
      },
    ],
  };
}

function emptyResult(subtotal: number, province: PlaceOfSupplyResult["province"]): PlaceOfSupplyResult {
  return {
    province,
    regime: "gst",
    subtotal,
    gst: 0,
    hst: 0,
    pst: 0,
    qst: 0,
    total: subtotal,
    lines: [],
  };
}

/** Restricted ITR (large businesses, Revenu Québec) — apply to QST on listed categories. */
export const RESTRICTED_ITR_CATEGORIES = {
  road_vehicles: 0,
  fuel: 0,
  electricity_gas: 0.5,
  telecommunications: 0.5,
} as const;

export function recoverableQst(qstPaid: number, category: keyof typeof RESTRICTED_ITR_CATEGORIES | "unrestricted", largeBusiness: boolean) {
  if (!largeBusiness || category === "unrestricted") return round2(qstPaid);
  return round2(qstPaid * RESTRICTED_ITR_CATEGORIES[category]);
}
