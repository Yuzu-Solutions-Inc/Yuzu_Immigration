import {
  extraSeatMonthlyCad,
  PRICING,
  type PricingPlanId,
} from "@/lib/marketing/pricing";

export type BillingInterval = "month" | "year";

/** Max seats an admin can add in one billing update. */
export const MAX_SEAT_ADD = 10;

/** Former Team plan included this many seats. Used when reading old Stripe items. */
export const LEGACY_TEAM_INCLUDED_SEATS = 4;

export type SeatCatalog = {
  plan: PricingPlanId;
  extraSeats: number;
  seatQuantity: number;
  monthlyCad: number;
};

export function includedSeats(plan: PricingPlanId): number {
  return plan === "team"
    ? LEGACY_TEAM_INCLUDED_SEATS
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

export function catalogMonthlyCad(
  catalog: Pick<SeatCatalog, "plan" | "extraSeats">,
  founding: boolean,
): number {
  const extras = Math.max(0, catalog.extraSeats);
  if (catalog.plan === "team") {
    return catalogMonthlyCad(
      {
        plan: "standard",
        extraSeats: extras + (LEGACY_TEAM_INCLUDED_SEATS - 1),
      },
      founding,
    );
  }
  return (
    (founding
      ? PRICING.standard.foundingMonthly
      : PRICING.standard.listMonthly) +
    extras * extraSeatMonthlyCad(founding)
  );
}

/** Standard first seat plus extra seats to cover this occupancy. */
export function catalogForOccupancy(
  occupancy: number,
  founding: boolean,
): SeatCatalog {
  const extraSeats = extraSeatsNeeded("standard", Math.max(1, occupancy));
  return {
    plan: "standard",
    extraSeats,
    seatQuantity: totalPaidSeats("standard", extraSeats),
    monthlyCad: catalogMonthlyCad({ plan: "standard", extraSeats }, founding),
  };
}

export function catalogFromLicensed(
  plan: PricingPlanId,
  seatQuantity: number,
  founding: boolean,
): SeatCatalog {
  const seats = Math.max(1, seatQuantity);
  if (plan === "team") {
    return catalogForOccupancy(seats, founding);
  }
  const extraSeats = billedExtraSeats("standard", seats);
  return {
    plan: "standard",
    extraSeats,
    seatQuantity: totalPaidSeats("standard", extraSeats),
    monthlyCad: catalogMonthlyCad({ plan: "standard", extraSeats }, founding),
  };
}

/** Seats to bill on the next invoice. True-up drops unused; otherwise keep licensed. */
export function renewalSeatTarget(input: {
  licensed: number;
  occupancy: number;
  trueUp: boolean;
}): number {
  const occupancy = Math.max(1, input.occupancy);
  const licensed = Math.max(1, input.licensed);
  return input.trueUp ? occupancy : Math.max(licensed, occupancy);
}

