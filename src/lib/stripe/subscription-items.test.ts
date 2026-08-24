import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  catalogItemsNeedReplaceAll,
  compactCatalogItem,
  isAutomaticTaxSetupError,
  lookupKeyIsTeam,
  subscriptionAutomaticTaxParams,
} from "@/lib/stripe/subscription-items";

describe("subscription item helpers", () => {
  it("replaces every item when switching billing interval", () => {
    assert.equal(
      catalogItemsNeedReplaceAll("month", "year", ["standard_list_monthly"]),
      true,
    );
  });

  it("replaces every item when converting a legacy Team price", () => {
    assert.equal(lookupKeyIsTeam("team_list_monthly"), true);
    assert.equal(
      catalogItemsNeedReplaceAll("month", "month", ["team_list_monthly"]),
      true,
    );
  });

  it("updates Standard extra seats in place on the same interval", () => {
    assert.equal(
      catalogItemsNeedReplaceAll("month", "month", [
        "standard_list_monthly",
        "extra_seat_founding_monthly",
      ]),
      false,
    );
  });

  it("keeps automatic tax on only when the subscription already collects it", () => {
    assert.deepEqual(
      subscriptionAutomaticTaxParams({ automatic_tax: { enabled: true } }),
      { automatic_tax: { enabled: true } },
    );
    assert.deepEqual(
      subscriptionAutomaticTaxParams({ automatic_tax: { enabled: false } }),
      {},
    );
    assert.deepEqual(subscriptionAutomaticTaxParams({}), {});
  });

  it("detects Stripe Tax setup errors from seat updates", () => {
    assert.equal(
      isAutomaticTaxSetupError({
        message:
          "You must have a valid head office address to enable automatic tax calculation in test mode.",
      }),
      true,
    );
    assert.equal(isAutomaticTaxSetupError({ message: "No such price" }), false);
  });

  it("omits empty subscription item ids so Stripe creates a new item", () => {
    assert.deepEqual(
      compactCatalogItem({
        id: undefined,
        price: "price_extra",
        quantity: 9,
      }),
      { price: "price_extra", quantity: 9 },
    );
    assert.deepEqual(
      compactCatalogItem({ id: "si_plan", price: "price_standard", quantity: 1 }),
      { id: "si_plan", price: "price_standard", quantity: 1 },
    );
  });
});
