import {
  parseSagePercent,
  sageListAll,
  type SageConnectionRow,
  type SageLedgerAccount,
  type SageTaxRate,
} from "./client";
import { CA_PROVINCES, expectedCaTax } from "./tax-regions";

export type SageTaxMappingRow = {
  id: string;
  organization_id: string;
  country_code: string;
  region_code: string | null;
  sage_tax_rate_id: string;
  sage_tax_rate_name: string | null;
  percentage: string | number;
};

export async function listSageTaxRates(connection: SageConnectionRow) {
  const rates = await sageListAll<SageTaxRate>(connection, "/tax_rates");
  return rates.filter((row) => row.id && row.is_visible !== false);
}

export async function listSageSalesLedgerAccounts(
  connection: SageConnectionRow,
) {
  const accounts = await sageListAll<SageLedgerAccount>(
    connection,
    "/ledger_accounts",
  );
  const sales = accounts.filter((row) => {
    if (row.visible_in_sales) return true;
    const type = `${row.ledger_account_type?.displayed_as ?? ""} ${row.ledger_account_type?.id ?? ""}`.toLowerCase();
    return type.includes("sales") || type.includes("income") || type.includes("revenue");
  });
  return (sales.length > 0 ? sales : accounts).filter((row) => row.id);
}

function closestTaxRate(rates: SageTaxRate[], percent: number) {
  let best: SageTaxRate | null = null;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (const rate of rates) {
    const value = parseSagePercent(rate.percentage);
    if (value == null) continue;
    const delta = Math.abs(value - percent);
    if (delta < bestDelta) {
      best = rate;
      bestDelta = delta;
    }
  }
  if (!best || bestDelta > 0.05) return null;
  const same = rates.filter((rate) => {
    const value = parseSagePercent(rate.percentage);
    return value != null && Math.abs(value - percent) <= 0.05;
  });
  if (same.length <= 1) return best;
  const labelled = same.find((rate) => {
    const label = `${rate.displayed_as ?? ""} ${rate.name ?? ""}`.toUpperCase();
    if (percent === 13 || percent === 15) return label.includes("HST");
    if (percent === 14.975) return label.includes("QST") || label.includes("GST");
    if (percent === 5) return label.includes("GST") && !label.includes("HST");
    return true;
  });
  return labelled ?? best;
}

export function suggestCaTaxMappings(rates: SageTaxRate[]) {
  return CA_PROVINCES.flatMap((province) => {
    const rate = closestTaxRate(rates, province.percent);
    if (!rate?.id) return [];
    return [
      {
        country_code: "CA",
        region_code: province.code,
        sage_tax_rate_id: rate.id,
        sage_tax_rate_name: rate.displayed_as ?? rate.name ?? province.label,
        percentage: parseSagePercent(rate.percentage) ?? province.percent,
      },
    ];
  });
}

export function resolveTaxMapping(input: {
  mappings: SageTaxMappingRow[];
  country: string;
  region: string | null;
}) {
  const country = input.country.toUpperCase();
  const region = input.region?.toUpperCase() || null;
  const exact = input.mappings.find(
    (row) =>
      row.country_code.toUpperCase() === country &&
      (row.region_code?.toUpperCase() || null) === region,
  );
  if (exact) return exact;
  const countryDefault = input.mappings.find(
    (row) =>
      row.country_code.toUpperCase() === country && !row.region_code,
  );
  if (countryDefault) return countryDefault;
  if (country === "CA" && region) {
    const expected = expectedCaTax(region);
    if (expected) {
      const byPercent = input.mappings.find((row) => {
        const percent = Number(row.percentage);
        return (
          row.country_code.toUpperCase() === "CA" &&
          Math.abs(percent - expected.percent) < 0.05
        );
      });
      if (byPercent) return byPercent;
    }
  }
  return null;
}

export function mappingPercent(row: SageTaxMappingRow) {
  const value = Number(row.percentage);
  return Number.isFinite(value) ? value : 0;
}
