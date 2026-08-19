"use server";

import { z } from "zod";

import { toAppLocale } from "@/lib/i18n/locales";
import { prepareSagePaymentCheckout } from "@/lib/sage/checkout";
import { CA_PROVINCES } from "@/lib/sage/tax-regions";

export type PublicPayState = {
  error?: string;
  checkoutUrl?: string;
};

const addressSchema = z.object({
  token: z.string().min(12),
  locale: z.enum(["en", "fr", "es"]),
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(80).optional().or(z.literal("")),
  city: z.string().trim().min(1).max(80),
  country: z.string().trim().min(2).max(8),
  region: z.string().trim().max(40).optional().or(z.literal("")),
  postalCode: z.string().trim().min(1).max(20),
});

export async function submitPayAddressAction(
  _prev: PublicPayState,
  formData: FormData,
): Promise<PublicPayState> {
  const parsed = addressSchema.safeParse({
    token: String(formData.get("token") || ""),
    locale: toAppLocale(String(formData.get("locale") || "en")),
    line1: String(formData.get("line1") || ""),
    line2: String(formData.get("line2") || ""),
    city: String(formData.get("city") || ""),
    country: String(formData.get("country") || ""),
    region: String(formData.get("region") || ""),
    postalCode: String(formData.get("postalCode") || ""),
  });
  if (!parsed.success) return { error: "invalid" };

  const country = parsed.data.country.toUpperCase();
  if (country === "CA") {
    const region = parsed.data.region?.toUpperCase() || "";
    if (!CA_PROVINCES.some((row) => row.code === region)) {
      return { error: "region_required" };
    }
  }

  try {
    const result = await prepareSagePaymentCheckout({
      token: parsed.data.token,
      locale: parsed.data.locale,
      address: {
        line1: parsed.data.line1,
        line2: parsed.data.line2 || undefined,
        city: parsed.data.city,
        country,
        region: parsed.data.region || null,
        postalCode: parsed.data.postalCode,
      },
    });
    if ("error" in result && result.error) {
      return { error: result.error };
    }
    if (!("checkoutUrl" in result) || !result.checkoutUrl) {
      return { error: "create_failed" };
    }
    return { checkoutUrl: result.checkoutUrl };
  } catch (error) {
    console.error("submitPayAddressAction:", error);
    return { error: "create_failed" };
  }
}

export async function preparePayCheckoutAction(
  token: string,
  locale: string,
): Promise<PublicPayState> {
  try {
    const result = await prepareSagePaymentCheckout({
      token,
      locale: toAppLocale(locale),
    });
    if ("error" in result && result.error) {
      return { error: result.error };
    }
    if (!("checkoutUrl" in result) || !result.checkoutUrl) {
      return { error: "create_failed" };
    }
    return { checkoutUrl: result.checkoutUrl };
  } catch (error) {
    console.error("preparePayCheckoutAction:", error);
    return { error: "create_failed" };
  }
}
