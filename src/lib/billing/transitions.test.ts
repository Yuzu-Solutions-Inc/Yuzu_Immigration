import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  pendingCatalogApplied,
  renewalRosterIsValid,
  transitionAfterIntervalChange,
  transitionAfterSeatAdd,
  transitionAfterSeatRemoval,
  transitionToSeatQuantity,
  type BillingTransition,
} from "@/lib/billing/transitions";

const monthlyFourToTwo: BillingTransition = {
  currentSeats: 4,
  nextSeats: 2,
  currentInterval: "month",
  nextInterval: "month",
};

describe("billing transitions", () => {
  it("adds seats now and to the existing renewal target", () => {
    assert.deepEqual(transitionAfterSeatAdd(monthlyFourToTwo, 1), {
      currentSeats: 5,
      nextSeats: 3,
      currentInterval: "month",
      nextInterval: "month",
    });
  });

  it("removes seats only from the renewal target", () => {
    assert.deepEqual(
      transitionAfterSeatRemoval(
        {
          ...monthlyFourToTwo,
          currentSeats: 4,
          nextSeats: 4,
        },
        2,
      ),
      monthlyFourToTwo,
    );
  });

  it("combines a yearly switch with a pending seat reduction", () => {
    assert.deepEqual(transitionAfterIntervalChange(monthlyFourToTwo, "year"), {
      ...monthlyFourToTwo,
      nextInterval: "year",
    });
  });

  it("never schedules fewer than the owner seat", () => {
    assert.equal(
      transitionAfterSeatRemoval(monthlyFourToTwo, 20).nextSeats,
      1,
    );
  });

  it("sets an absolute next quantity without dropping below occupancy", () => {
    assert.deepEqual(
      transitionToSeatQuantity(
        { ...monthlyFourToTwo, nextSeats: 4 },
        1,
        1,
      ),
      { ...monthlyFourToTwo, nextSeats: 1 },
    );
    assert.deepEqual(
      transitionToSeatQuantity(monthlyFourToTwo, 1, 3),
      { ...monthlyFourToTwo, nextSeats: 3 },
    );
    assert.deepEqual(
      transitionToSeatQuantity(monthlyFourToTwo, 6, 1),
      {
        currentSeats: 6,
        nextSeats: 6,
        currentInterval: "month",
        nextInterval: "month",
      },
    );
  });

  it("recognizes the scheduled phase only when quantity and interval match", () => {
    assert.equal(
      pendingCatalogApplied({
        activeSeats: 2,
        activeInterval: "year",
        pendingSeats: 2,
        pendingInterval: "year",
      }),
      true,
    );
    assert.equal(
      pendingCatalogApplied({
        activeSeats: 2,
        activeInterval: "month",
        pendingSeats: 2,
        pendingInterval: "year",
      }),
      false,
    );
  });

  it("requires the owner and rejects duplicate or foreign roster members", () => {
    const base = {
      ownerMemberId: "owner",
      organizationMemberIds: ["owner", "admin", "case"],
      seatTarget: 2,
    };
    assert.equal(
      renewalRosterIsValid({
        ...base,
        selectedMemberIds: ["owner", "case"],
      }),
      true,
    );
    assert.equal(
      renewalRosterIsValid({
        ...base,
        selectedMemberIds: ["admin", "case"],
      }),
      false,
    );
    assert.equal(
      renewalRosterIsValid({
        ...base,
        selectedMemberIds: ["owner", "owner"],
      }),
      false,
    );
    assert.equal(
      renewalRosterIsValid({
        ...base,
        selectedMemberIds: ["owner", "outsider"],
      }),
      false,
    );
  });
});
