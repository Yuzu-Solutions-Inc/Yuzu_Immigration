export type BookingRateKind = "standard" | "urgent";

export const SERVICE_LINK_TTL_DAYS = 7;
export const URGENT_AUTO_DAYS_MIN = 1;
export const URGENT_AUTO_DAYS_MAX = 90;

export type ServicePricing = {
  price_cents: number;
  urgent_price_cents: number | null;
  urgent_auto_within_days: number | null;
};

const DAY_MS = 86_400_000;

export function hasUrgentPricing(service: ServicePricing) {
  return (
    service.urgent_price_cents != null && service.urgent_price_cents >= 0
  );
}

export function resolveBookingPrice(input: {
  service: ServicePricing;
  rateKind: BookingRateKind;
  startsAt?: string | null;
  from?: Date;
}): { amountCents: number; applied: BookingRateKind } {
  const urgentPrice = input.service.urgent_price_cents;
  if (urgentPrice == null || urgentPrice < 0) {
    return { amountCents: input.service.price_cents, applied: "standard" };
  }
  if (input.rateKind === "urgent") {
    return { amountCents: urgentPrice, applied: "urgent" };
  }

  const withinDays = input.service.urgent_auto_within_days;
  const startsAt = input.startsAt;
  if (
    withinDays != null &&
    withinDays >= URGENT_AUTO_DAYS_MIN &&
    startsAt
  ) {
    const startMs = Date.parse(startsAt);
    const fromMs = (input.from ?? new Date()).getTime();
    if (
      Number.isFinite(startMs) &&
      startMs >= fromMs &&
      startMs - fromMs < withinDays * DAY_MS
    ) {
      return { amountCents: urgentPrice, applied: "urgent" };
    }
  }

  return { amountCents: input.service.price_cents, applied: "standard" };
}
