import { PRICING, type PricingPlanId } from "@/lib/marketing/pricing";

export type BillingInterval = "month" | "year";

export type SeatCatalog = {
  plan: PricingPlanId;
  extraSeats: number;
  seatQuantity: number;
  monthlyCad: number;
};

export function includedSeats(plan: PricingPlanId): number {
  return plan === "team"
    ? PRICING.team.includedUsers
    : PRICING.standard.includedUsers;
}

export function extraSeatsNeeded(
  plan: PricingPlanId,
  memberCount: number,
): number {
  return Math.max(0, memberCount - includedSeats(plan));
}

export function billedExtraSeats(
  plan: PricingPlanId,
  seatQuantity: number,
): number {
  return Math.max(0, seatQuantity - includedSeats(plan));
}

export function totalPaidSeats(
  plan: PricingPlanId,
  extraSeats: number,
): number {
  return includedSeats(plan) + Math.max(0, extraSeats);
}

export function planMonthlyCad(
  plan: PricingPlanId,
  founding: boolean,
): number {
  if (plan === "team") {
    return founding ? PRICING.team.foundingMonthly : PRICING.team.listMonthly;
  }
  return founding
    ? PRICING.standard.foundingMonthly
    : PRICING.standard.listMonthly;
}

export function catalogMonthlyCad(
  catalog: Pick<SeatCatalog, "plan" | "extraSeats">,
  founding: boolean,
): number {
  return (
    planMonthlyCad(catalog.plan, founding) +
    Math.max(0, catalog.extraSeats) * PRICING.extraSeatMonthly
  );
}

/** Cheapest Standard vs Team mix that covers this many occupied seats. */
export function catalogForOccupancy(
  occupancy: number,
  founding: boolean,
): SeatCatalog {
  const seats = Math.max(1, occupancy);
  const standardExtra = extraSeatsNeeded("standard", seats);
  const teamExtra = extraSeatsNeeded("team", seats);
  const standard: SeatCatalog = {
    plan: "standard",
    extraSeats: standardExtra,
    seatQuantity: totalPaidSeats("standard", standardExtra),
    monthlyCad: catalogMonthlyCad(
      { plan: "standard", extraSeats: standardExtra },
      founding,
    ),
  };
  const team: SeatCatalog = {
    plan: "team",
    extraSeats: teamExtra,
    seatQuantity: totalPaidSeats("team", teamExtra),
    monthlyCad: catalogMonthlyCad(
      { plan: "team", extraSeats: teamExtra },
      founding,
    ),
  };
  return standard.monthlyCad <= team.monthlyCad ? standard : team;
}

export function catalogFromLicensed(
  plan: PricingPlanId,
  seatQuantity: number,
  founding: boolean,
): SeatCatalog {
  const extraSeats = billedExtraSeats(plan, seatQuantity);
  return {
    plan,
    extraSeats,
    seatQuantity: totalPaidSeats(plan, extraSeats),
    monthlyCad: catalogMonthlyCad({ plan, extraSeats }, founding),
  };
}
