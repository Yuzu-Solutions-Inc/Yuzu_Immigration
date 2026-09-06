import { round2 } from "./taxes";
import type { SalesTaxTotals } from "./salesTaxCalc";

export type Gst34Worksheet = {
  form: "GST34";
  line101_supplies: number;
  line103_gstCollected: number;
  line106_itc: number;
  line109_net: number;
};

export type Vd458Worksheet = {
  form: "VD-458";
  totalTaxableSupplies: number;
  qstCollected: number;
  itr: number;
  restrictedItrHaircut: number;
  net: number;
};

export function buildGst34Worksheet(params: {
  supplies: number;
  totals: SalesTaxTotals;
}): Gst34Worksheet {
  return {
    form: "GST34",
    line101_supplies: round2(params.supplies),
    line103_gstCollected: params.totals.gst_collected,
    line106_itc: params.totals.gst_itc,
    line109_net: params.totals.gst_net,
  };
}

export function buildVd458Worksheet(params: {
  supplies: number;
  totals: SalesTaxTotals;
  restrictedItrHaircut?: number;
}): Vd458Worksheet {
  const haircut = round2(params.restrictedItrHaircut ?? 0);
  return {
    form: "VD-458",
    totalTaxableSupplies: round2(params.supplies),
    qstCollected: params.totals.qst_collected,
    itr: params.totals.qst_itr,
    restrictedItrHaircut: haircut,
    net: round2(params.totals.qst_net + haircut),
  };
}
