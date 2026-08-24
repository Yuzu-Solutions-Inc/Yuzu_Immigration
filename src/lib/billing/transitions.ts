import type { BillingInterval } from "@/lib/billing/plans";

export type BillingTransition = {
  currentSeats: number;
  nextSeats: number;
  currentInterval: BillingInterval;
  nextInterval: BillingInterval;
};

export function transitionAfterSeatAdd(
  transition: BillingTransition,
  quantity: number,
): BillingTransition {
  const added = Math.max(1, Math.trunc(quantity));
  return {
    ...transition,
    currentSeats: Math.max(1, transition.currentSeats) + added,
    nextSeats: Math.max(1, transition.nextSeats) + added,
  };
}

export function transitionAfterSeatRemoval(
  transition: BillingTransition,
  quantity: number,
): BillingTransition {
  const removed = Math.max(1, Math.trunc(quantity));
  return {
    ...transition,
    nextSeats: Math.max(1, Math.max(1, transition.nextSeats) - removed),
  };
}

/** Absolute seat target. Increases bill now; decreases apply at renewal. */
export function transitionToSeatQuantity(
  transition: BillingTransition,
  target: number,
  occupancy: number,
): BillingTransition {
  const seats = Math.max(1, occupancy, Math.trunc(target));
  if (seats >= transition.currentSeats) {
    return {
      ...transition,
      currentSeats: seats,
      nextSeats: seats,
    };
  }
  return { ...transition, nextSeats: seats };
}

export function transitionAfterIntervalChange(
  transition: BillingTransition,
  interval: BillingInterval,
): BillingTransition {
  return { ...transition, nextInterval: interval };
}

export function pendingCatalogApplied(input: {
  activeSeats: number;
  activeInterval: BillingInterval | null;
  pendingSeats: number | null;
  pendingInterval: BillingInterval | null;
}): boolean {
  return Boolean(
    input.pendingSeats &&
      input.pendingInterval &&
      input.activeSeats === input.pendingSeats &&
      input.activeInterval === input.pendingInterval,
  );
}

export function renewalRosterIsValid(input: {
  ownerMemberId: string;
  selectedMemberIds: readonly string[];
  organizationMemberIds: readonly string[];
  seatTarget: number;
}): boolean {
  const selected = new Set(input.selectedMemberIds);
  const members = new Set(input.organizationMemberIds);
  return (
    selected.size === input.selectedMemberIds.length &&
    selected.has(input.ownerMemberId) &&
    selected.size <= Math.max(1, input.seatTarget) &&
    [...selected].every((id) => members.has(id))
  );
}
