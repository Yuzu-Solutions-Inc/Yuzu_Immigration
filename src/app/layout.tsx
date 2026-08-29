import type { Metadata, Viewport } from "next";

import { product } from "@/lib/brand/product";

export const metadata: Metadata = {
  title: product.name,
  description: product.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
