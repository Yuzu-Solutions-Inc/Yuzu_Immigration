import "server-only";

import { fetchGeneralLedgerData } from "@/lib/finance/glDataLoader";
import { fetchComplianceDeadlines } from "@/lib/finance/compliance";
import {
  fetchAdjustmentsScreen,
  fetchBankScreen,
  fetchBillingMetrics,
  fetchCompensationMetrics,
  fetchCorporateTaxScreen,
  fetchDividendsScreen,
  fetchEmployeeExpensesScreen,
  fetchEmployeesScreen,
  fetchEngagementsScreen,
  fetchInvoicesScreen,
  fetchPayrollScreen,
  fetchPipelineScreen,
  fetchSalesTaxScreen,
  fetchShareholdersScreen,
  fetchTimeScreen,
} from "@/lib/finance/screen-data";
import { requireFinanceWorkspace } from "@/lib/finance/server";

async function financeDb() {
  return (await requireFinanceWorkspace()).db;
}

export async function loadBillingMetrics() {
  return fetchBillingMetrics(await financeDb());
}

export async function loadCompensationMetrics() {
  return fetchCompensationMetrics(await financeDb());
}

export async function loadEngagementsScreen() {
  return fetchEngagementsScreen(await financeDb());
}

export async function loadPipelineScreen() {
  return fetchPipelineScreen(await financeDb());
}

export async function loadInvoicesScreen() {
  return fetchInvoicesScreen(await financeDb());
}

export async function loadTimeScreen() {
  return fetchTimeScreen(await financeDb());
}

export async function loadEmployeesScreen() {
  return fetchEmployeesScreen(await financeDb());
}

export async function loadShareholdersScreen() {
  return fetchShareholdersScreen(await financeDb());
}

export async function loadPayrollScreen() {
  return fetchPayrollScreen(await financeDb());
}

export async function loadDividendsScreen() {
  return fetchDividendsScreen(await financeDb());
}

export async function loadEmployeeExpensesScreen() {
  return fetchEmployeeExpensesScreen(await financeDb());
}

export async function loadAdjustmentsScreen() {
  return fetchAdjustmentsScreen(await financeDb());
}

export async function loadSalesTaxScreen() {
  return fetchSalesTaxScreen(await financeDb());
}

export async function loadCorporateTaxScreen() {
  return fetchCorporateTaxScreen(await financeDb());
}

export async function loadBankScreen() {
  return fetchBankScreen(await financeDb());
}

export async function loadGeneralLedgerScreen() {
  return fetchGeneralLedgerData(await financeDb());
}

export async function loadComplianceScreen() {
  return fetchComplianceDeadlines(await financeDb());
}
