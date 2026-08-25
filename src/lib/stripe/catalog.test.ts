import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  foundingCouponId,
  isFoundingCouponId,
  isLegacyForeverFoundingCouponId,
  remainingFoundingPromoMonths,
} from "@/lib/stripe/founding-ids";

describe("founding coupons", () => {
  it("uses a 12-month repeating coupon id, not the legacy forever id", () => {
    assert.equal(
      foundingCouponId("standard", "month"),
      "permitos_founding_standard_month_12m",
    );
    assert.equal(
      foundingCouponId("standard", "year", 5),
      "permitos_founding_standard_year_5m",
    );
    assert.equal(
      isLegacyForeverFoundingCouponId("permitos_founding_standard_month"),
      true,
    );
    assert.equal(
      isLegacyForeverFoundingCouponId("permitos_founding_standard_month_12m"),
      false,
    );
    assert.equal(isFoundingCouponId("permitos_founding_standard_month_12m"), true);
  });

  it("counts remaining promo months until the coupon end", () => {
    const now = 1_700_000_000;
    assert.equal(remainingFoundingPromoMonths(null, now), 0);
    assert.equal(remainingFoundingPromoMonths(now - 1, now), 0);
    assert.equal(
      remainingFoundingPromoMonths(now + 10 * 24 * 60 * 60, now),
      1,
    );
    assert.equal(
      remainingFoundingPromoMonths(now + 12 * 30 * 24 * 60 * 60, now),
      12,
    );
  });
});
