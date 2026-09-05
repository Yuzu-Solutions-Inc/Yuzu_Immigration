import { ImageResponse } from "next/og";

import { primitives } from "@/lib/design-tokens";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: primitives.graphite[900],
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
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
      </div>
    ),
    size,
  );
}
