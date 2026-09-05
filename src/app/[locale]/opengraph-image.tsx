import { ImageResponse } from "next/og";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { product } from "@/lib/brand/product";
import { primitives } from "@/lib/design-tokens";

export const alt = product.tagline;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "home" });

  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: primitives.graphite[900],
          padding: "72px 80px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            color: "#ffffff",
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: "-0.03em",
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24">
            <path
              d="M3.2 11.2 21 4 14.2 21.2 11.6 13.4 3.2 11.2Z"
              fill="#ffffff"
            />
            <path
              d="M11.6 13.4 21 4"
              stroke={primitives.indigo[300]}
              strokeWidth="1.4"
              fill="none"
            />
          </svg>
          <span>{product.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}
          >
            {t("audience")}
          </div>
          <div
            style={{
              color: "#ffffff",
              fontSize: 52,
              fontWeight: 700,
              lineHeight: 1.15,
              letterSpacing: "-0.03em",
              maxWidth: 980,
            }}
          >
            {t("title")}
          </div>
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 22,
          }}
        >
          {product.domain}
        </div>
      </div>
    ),
    size,
  );
}
