import type { Metadata, Viewport } from "next";

import { product } from "@/lib/brand/product";

export const metadata: Metadata = {
  metadataBase: new URL(product.siteUrl),
  title: {
    default: product.name,
    template: `%s | ${product.name}`,
  },
  description: product.tagline,
  applicationName: product.name,
  authors: [{ name: product.operator, url: product.siteUrl }],
  creator: product.operator,
  publisher: product.operator,
  category: "business",
  referrer: "origin-when-cross-origin",
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
