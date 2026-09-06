"use server";

import { z } from "zod";

import { loadExecutiveDashboard } from "@/lib/finance/load-executive-dashboard";
import type { DateRange } from "@/lib/finance/fiscalPeriod";

const periodSchema = z.object({
  label: z.string().min(1).max(80),
  start: z.string().min(1).max(20),
  end: z.string().min(1).max(20),
});

export async function loadExecutiveDashboardAction(period: DateRange) {
  const parsed = periodSchema.safeParse(period);
  if (!parsed.success) {
    throw new Error("invalid_period");
  }
  return loadExecutiveDashboard(parsed.data);
}
