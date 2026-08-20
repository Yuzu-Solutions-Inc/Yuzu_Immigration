import type { Metadata } from "next";

import { product } from "@/lib/brand/product";

export const metadata: Metadata = {
  title: product.name,
  description: product.tagline,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
